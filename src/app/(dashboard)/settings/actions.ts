"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireStudio, getArtists } from "@/lib/studio";
import { parsePounds } from "@/lib/money";
import { DEFAULT_HOURS, type DepositRule, type OpeningHours } from "@/lib/types";
import { sendEmail, emailConfigured } from "@/lib/messaging/email";
import { siteOrigin } from "@/lib/origin";
import type { AnsweringMode } from "@/lib/answering";

const ANSWERING_MODES: AnsweringMode[] = ["always", "when_free", "always_ask_me"];

export type FormState = { error?: string; ok?: boolean };

/** Sentinel: leave the existing deposit rule alone. */
const studioDepositUnchanged = Symbol("unchanged");

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();

function readHours(fd: FormData): OpeningHours[] {
  return DEFAULT_HOURS.map(({ day }) => ({
    day,
    open: str(fd, `hours_${day}_open`) || "10:00",
    close: str(fd, `hours_${day}_close`) || "18:00",
    closed: fd.get(`hours_${day}_closed`) === "on",
  }));
}

function readDepositRule(fd: FormData): DepositRule | { error: string } {
  if (str(fd, "deposit_type") === "percent") {
    const percent = Number(str(fd, "deposit_percent"));
    const min = parsePounds(fd.get("deposit_min"));
    if (!Number.isFinite(percent) || percent <= 0 || percent > 100)
      return { error: "Deposit percentage must be between 1 and 100." };
    if (min == null) return { error: "Enter a minimum deposit." };
    return { type: "percent", percent, min_pence: min };
  }
  const amount = parsePounds(fd.get("deposit_amount"));
  if (amount == null || amount === 0) return { error: "Enter a deposit amount." };
  return { type: "fixed", amount_pence: amount };
}

// ------------------------------------------------------------------ studio

export async function updateStudio(_prev: FormState, fd: FormData): Promise<FormState> {
  const { studio } = await requireStudio();
  const supabase = await createClient();

  const name = str(fd, "name");
  if (!name) return { error: "Studio name is required." };

  const depositMode = str(fd, "deposit_mode") || "required";
  // A business that takes no deposits should not be blocked by an unset amount.
  const deposit =
    depositMode === "none" ? studioDepositUnchanged : readDepositRule(fd);
  if (deposit !== studioDepositUnchanged && "error" in deposit) {
    return { error: deposit.error };
  }

  const terms = str(fd, "terms_url");
  if (terms && !/^https?:\/\//i.test(terms))
    return { error: "Terms URL must start with http:// or https://" };

  const privacy = str(fd, "privacy_notice_url");
  if (privacy && !/^https?:\/\//i.test(privacy))
    return { error: "Privacy notice URL must start with http:// or https://" };

  const { error } = await supabase
    .from("studios")
    .update({
      name,
      email: str(fd, "email") || null,
      tone: str(fd, "tone"),
      // Blank means "use the trade pack's wording", not "no greeting".
      greeting: str(fd, "greeting") || null,
      hours: readHours(fd),
      ...(deposit === studioDepositUnchanged ? {} : { deposit_rule: deposit }),
      deposit_mode: depositMode,
      vat_registered: fd.get("vat_registered") === "on",
      vat_rate_percent: Math.min(
        100,
        Math.max(0, Number(str(fd, "vat_rate_percent")) || 20),
      ),
      prices_include_vat: fd.get("prices_include_vat") !== "off",
      vat_number: str(fd, "vat_number") || null,
      travel_mode: str(fd, "travel_mode") || "at_premises",
      travel_buffer_minutes: Math.min(
        240,
        Math.max(0, Number(str(fd, "travel_buffer_minutes")) || 0),
      ),
      service_areas: str(fd, "service_areas")
        .split(/[,\s]+/)
        .map((a) => a.trim().toUpperCase())
        .filter(Boolean),
      cancellation_policy: str(fd, "cancellation_policy"),
      privacy_notice_url: privacy || null,
      terms_url: terms || null,
      stripe_account_id: str(fd, "stripe_account_id") || null,
      timezone: str(fd, "timezone") || "Europe/London",
      notice_hours: Math.min(720, Math.max(0, Number(str(fd, "notice_hours")) || 0)),
      consultation_minutes: Math.min(
        480,
        Math.max(5, Number(str(fd, "consultation_minutes")) || 30),
      ),
      max_session_minutes: Math.min(
        1440,
        Math.max(30, Number(str(fd, "max_session_minutes")) || 360),
      ),
    })
    .eq("id", studio.id);

  if (error) return { error: error.message };

  revalidatePath("/settings");
  revalidatePath("/");
  return { ok: true };
}

// ------------------------------------------------------------------ artists

/** Photos go in the public avatars bucket, under the studio's own folder. */
async function uploadAvatar(
  supabase: Awaited<ReturnType<typeof createClient>>,
  studioId: string,
  file: File,
): Promise<{ path?: string; error?: string }> {
  if (file.size > 4 * 1024 * 1024) return { error: "That photo is too big (4MB max)." };
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    return { error: "Photos must be a JPEG, PNG or WebP." };
  }

  const extension = file.type.split("/")[1].replace("jpeg", "jpg");
  const path = `${studioId}/${crypto.randomUUID()}.${extension}`;

  const { error } = await supabase.storage
    .from("avatars")
    .upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: false });

  if (error) return { error: error.message };
  return { path };
}

/** Lower-case, hyphenated, safe in a URL. */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);
}

export async function saveArtist(_prev: FormState, fd: FormData): Promise<FormState> {
  const { studio } = await requireStudio();
  const supabase = await createClient();

  if (str(fd, "intent") === "delete") {
    const { error } = await supabase.from("artists").delete().eq("id", str(fd, "id"));
    // 23503: a booking still references this artist. bookings.artist_id is
    // `on delete restrict` so the diary can never be orphaned.
    if (error?.code === "23503") {
      return {
        error:
          "This artist has bookings, so they cannot be deleted. Untick “Taking bookings” " +
          "to stop new enquiries reaching them.",
      };
    }
    if (error) return { error: error.message };
    revalidatePath("/settings/artists");
    revalidatePath("/settings/pricing");
    return { ok: true };
  }

  const name = str(fd, "name");
  if (!name) return { error: "Artist name is required." };

  /*
   * How many people this account is entitled to.
   *
   * Checked only when adding somebody new — editing or deactivating an existing
   * person must never be blocked by it, or a business that has gone over could
   * not get back under.
   *
   * Null means no limit, which is what every business had before this existed,
   * so nothing changed underneath anybody. The message says who to ask rather
   * than just refusing: the limit is a commercial arrangement, not a fault, and
   * somebody hitting it is somebody who wants to pay for more.
   */
  if (!str(fd, "id") && studio.seat_limit != null) {
    const { count } = await supabase
      .from("artists")
      .select("id", { count: "exact", head: true })
      .eq("studio_id", studio.id);

    if ((count ?? 0) >= studio.seat_limit) {
      return {
        error:
          `Your plan covers ${studio.seat_limit} ${studio.seat_limit === 1 ? "person" : "people"}, ` +
          "and they are all in use. Ask us to add another and we will sort it out.",
      };
    }
  }

  const provider = str(fd, "booking_provider") || "native";
  if (provider === "ical_link" && !str(fd, "ical_url")) {
    return { error: "A booking platform needs its calendar feed URL." };
  }
  if ((provider === "ical_link" || provider === "link_only") && !str(fd, "booking_url")) {
    return { error: "That option needs the public booking page link." };
  }
  for (const field of ["ical_url", "booking_url"]) {
    const value = str(fd, field);
    if (value && !/^(https?|webcal):\/\//i.test(value)) {
      return { error: "Links must start with http://, https:// or webcal://" };
    }
  }

  const hourly = parsePounds(fd.get("hourly_rate"));
  const minCharge = parsePounds(fd.get("min_charge"));
  if (hourly == null) return { error: "Enter an hourly rate." };
  if (minCharge == null) return { error: "Enter a minimum charge." };

  /*
   * The handle is what goes in this person's own booking link, so it wants to
   * be readable in an Instagram bio. Derived from the name when they have not
   * chosen one, and made unique within the studio because two Sarahs is not a
   * rare problem in a salon.
   */
  const wanted =
    slugify(str(fd, "handle")) || slugify(name.split(/\s+/)[0]) || "team";
  const { data: clashes } = await supabase
    .from("artists")
    .select("id, handle")
    .eq("studio_id", studio.id)
    .neq("id", str(fd, "id") || "00000000-0000-0000-0000-000000000000");
  const taken = new Set((clashes ?? []).map((a) => (a.handle ?? "").toLowerCase()));
  let handle = wanted;
  for (let n = 2; taken.has(handle); n++) handle = `${wanted}-${n}`;

  /*
   * Their own working week, when they have said they have one.
   *
   * Null rather than a copy of the business's, so that "same as the business"
   * keeps following it — copying would silently freeze this person's hours the
   * day somebody ticked the box, and nobody would notice until the salon
   * changed its opening times.
   */
  const ownHours = fd.get("own_hours")
    ? Array.from({ length: 7 }, (_, day) => ({
        day,
        open: str(fd, `hours_${day}_open`) || "09:00",
        close: str(fd, `hours_${day}_close`) || "17:00",
        closed: fd.get(`hours_${day}_closed`) != null,
      }))
    : null;

  const row = {
    studio_id: studio.id,
    name,
    handle,
    email: str(fd, "email") || null,
    role: str(fd, "role") || null,
    // Blank means "sound like the business", which is what almost everybody
    // wants — so an empty box is null rather than an empty string.
    greeting: str(fd, "greeting") || null,
    tone: str(fd, "tone") || null,
    hours: ownHours,
    styles: fd.getAll("styles").map(String),
    hourly_rate_pence: hourly,
    min_charge_pence: minCharge,
    day_rate_pence: parsePounds(fd.get("day_rate")),
    calendar_id: str(fd, "calendar_id") || null,
    booking_provider: str(fd, "booking_provider") || "native",
    colour: str(fd, "colour") || null,
    ical_url: str(fd, "ical_url") || null,
    booking_url: str(fd, "booking_url") || null,
    active: fd.get("active") !== "off",
  };

  const photo = fd.get("avatar");
  if (photo instanceof File && photo.size > 0) {
    const uploaded = await uploadAvatar(supabase, studio.id, photo);
    if (uploaded.error) return { error: uploaded.error };
    (row as Record<string, unknown>).avatar_path = uploaded.path;
  } else if (fd.get("remove_avatar") === "true") {
    (row as Record<string, unknown>).avatar_path = null;
  }

  const id = str(fd, "id");
  const { error } = id
    ? await supabase.from("artists").update(row).eq("id", id)
    : await supabase.from("artists").insert(row);

  if (error) return { error: error.message };

  revalidatePath("/settings/artists");
  revalidatePath("/settings/pricing");
  revalidatePath("/diary");
  return { ok: true };
}

// ------------------------------------------------------------------ price bands

export async function saveBand(_prev: FormState, fd: FormData): Promise<FormState> {
  const { studio } = await requireStudio();
  const supabase = await createClient();

  if (str(fd, "intent") === "delete") {
    const { error } = await supabase.from("price_bands").delete().eq("id", str(fd, "id"));
    if (error) return { error: error.message };
    revalidatePath("/settings/pricing");
    return { ok: true };
  }

  const label = str(fd, "size_label");
  if (!label) return { error: "Give the service a name." };

  const fixed = str(fd, "pricing") === "fixed";

  let row: Record<string, unknown>;

  if (fixed) {
    const priceLow = parsePounds(fd.get("price_low"));
    const priceHigh = parsePounds(fd.get("price_high"));
    if (priceLow == null) return { error: "Enter the price." };
    if (priceHigh != null && priceHigh < priceLow) {
      return { error: "The top of the range must be at least the bottom." };
    }

    const minutes = Number(str(fd, "duration_minutes"));
    if (!Number.isFinite(minutes) || minutes < 5 || minutes > 1440) {
      return { error: "How long does it take? Between 5 minutes and 24 hours." };
    }

    row = {
      studio_id: studio.id,
      size_label: label,
      price_low_pence: priceLow,
      price_high_pence: priceHigh,
      duration_minutes: minutes,
      // Kept in step so the diary and any hourly maths still have something
      // sensible to read.
      hours_low: Math.max(0.25, minutes / 60),
      hours_high: Math.max(0.25, minutes / 60),
      sort_order: Number(str(fd, "sort_order")) || 0,
      requires_consultation: fd.get("requires_consultation") === "on",
    };
  } else {
    const low = Number(str(fd, "hours_low"));
    const high = Number(str(fd, "hours_high"));
    if (!Number.isFinite(low) || low <= 0) return { error: "Low hours must be greater than 0." };
    if (!Number.isFinite(high) || high < low) {
      return { error: "High hours must be at least the low hours." };
    }

    row = {
      studio_id: studio.id,
      size_label: label,
      hours_low: low,
      hours_high: high,
      // Clearing these is what switches a service back to hourly pricing.
      price_low_pence: null,
      price_high_pence: null,
      duration_minutes: null,
      sort_order: Number(str(fd, "sort_order")) || 0,
      requires_consultation: fd.get("requires_consultation") === "on",
    };
  }

  const id = str(fd, "id");
  const { error } = id
    ? await supabase.from("price_bands").update(row).eq("id", id)
    : await supabase.from("price_bands").insert(row);

  if (error) {
    return {
      error: error.code === "23505" ? "A band with that name already exists." : error.message,
    };
  }

  revalidatePath("/settings/pricing");
  return { ok: true };
}

/** The sizing scale from the spec, so a new studio is not staring at an empty table. */
const STARTER_BANDS = [
  { size_label: "Coin", hours_low: 0.5, hours_high: 1, requires_consultation: false },
  { size_label: "Palm", hours_low: 1, hours_high: 2, requires_consultation: false },
  { size_label: "Hand", hours_low: 2, hours_high: 3, requires_consultation: false },
  { size_label: "Forearm", hours_low: 3, hours_high: 5, requires_consultation: false },
  { size_label: "Half sleeve", hours_low: 6, hours_high: 12, requires_consultation: true },
  { size_label: "Full sleeve", hours_low: 15, hours_high: 30, requires_consultation: true },
  { size_label: "Back piece", hours_low: 25, hours_high: 50, requires_consultation: true },
];

export async function seedStarterBands(
  _prev: FormState,
  _fd: FormData,
): Promise<FormState> {
  const { studio } = await requireStudio();
  const supabase = await createClient();

  const { error } = await supabase.from("price_bands").insert(
    STARTER_BANDS.map((b, i) => ({ ...b, studio_id: studio.id, sort_order: i })),
  );
  if (error) return { error: error.message };

  revalidatePath("/settings/pricing");
  return { ok: true };
}

// ------------------------------------------------------------------ faqs

export async function saveFaq(_prev: FormState, fd: FormData): Promise<FormState> {
  const { studio } = await requireStudio();
  const supabase = await createClient();

  if (str(fd, "intent") === "delete") {
    const { error } = await supabase.from("faqs").delete().eq("id", str(fd, "id"));
    if (error) return { error: error.message };
    revalidatePath("/settings/faqs");
    return { ok: true };
  }

  const question = str(fd, "question");
  const answer = str(fd, "answer");
  if (!question || !answer) return { error: "Both a question and an answer are required." };

  const row = {
    studio_id: studio.id,
    question,
    answer,
    sort_order: Number(str(fd, "sort_order")) || 0,
  };

  const id = str(fd, "id");
  const { error } = id
    ? await supabase.from("faqs").update(row).eq("id", id)
    : await supabase.from("faqs").insert(row);

  if (error) return { error: error.message };

  revalidatePath("/settings/faqs");
  return { ok: true };
}

/**
 * The owner's own instructions for the assistant.
 *
 * Everything here is folded into the cached half of the system prompt, so it
 * costs nothing per message and applies from the very next conversation.
 *
 * The lists are one-per-line textareas rather than repeating fields: these get
 * written once and rarely edited, and a textarea is far quicker to fill in on
 * a phone than five separate inputs with add and remove buttons.
 */
export async function updateAssistant(_prev: FormState, fd: FormData): Promise<FormState> {
  const { studio } = await requireStudio();
  const supabase = await createClient();

  const lines = (key: string, cap = 20) =>
    String(fd.get(key) ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, cap);

  // Paired by position: the nth question goes with the nth answer. A pair with
  // either half missing is dropped rather than half-taught to the assistant.
  const asks = fd.getAll("example_ask").map((v) => String(v).trim());
  const replies = fd.getAll("example_reply").map((v) => String(v).trim());
  const examples = asks
    .map((ask, i) => ({ ask, reply: replies[i] ?? "" }))
    .filter((e) => e.ask && e.reply)
    .slice(0, 6);

  /*
   * Who answers first. Validated here rather than trusted from the form.
   *
   * Not because a business owner would try to break their own settings, but
   * because this decides whether a customer gets an answer — and an unknown
   * value falling through to "never reply" is exactly the failure the whole
   * feature is built to be incapable of.
   */
  const asked = str(fd, "answering_mode");
  const mode = ANSWERING_MODES.includes(asked as AnsweringMode)
    ? (asked as AnsweringMode)
    : "when_free";

  // Clamped to what the database will accept, so a stray value is corrected
  // rather than rejected with an error nobody can act on.
  const minutes = Math.min(60, Math.max(1, Number(fd.get("first_refusal_minutes")) || 5));

  const { error } = await supabase
    .from("studios")
    .update({
      email: str(fd, "email") || null,
      tone: str(fd, "tone"),
      always_mention: lines("always_mention"),
      never_mention: lines("never_mention"),
      escalate_when: lines("escalate_when"),
      voice_examples: examples,
      answering_mode: mode,
      first_refusal_minutes: minutes,
    })
    .eq("id", studio.id);

  if (error) return { error: error.message };

  revalidatePath("/settings/assistant");
  return { ok: true };
}

/**
 * Who offers a service.
 *
 * An empty list means everybody, and is stored as no rows rather than a row
 * per person — so adding somebody to the team automatically means they do
 * everything the business has not restricted, which is the behaviour anybody
 * would expect and the opposite of what a full list would give.
 */
export async function setServiceProviders(bandId: string, artistIds: string[]) {
  const { studio } = await requireStudio();
  const supabase = await createClient();

  // The band has to be this studio's; row-level security enforces it, but
  // checking here turns a silent no-op into an honest failure.
  const { data: band } = await supabase
    .from("price_bands")
    .select("id")
    .eq("id", bandId)
    .eq("studio_id", studio.id)
    .maybeSingle();
  if (!band) return { error: "That service is not yours." };

  await supabase.from("service_providers").delete().eq("band_id", bandId);

  if (artistIds.length) {
    const team = await getArtists(studio.id);
    const owned = artistIds.filter((id) => team.some((a) => a.id === id));
    if (owned.length) {
      await supabase
        .from("service_providers")
        .insert(owned.map((artist_id) => ({ band_id: bandId, artist_id })));
    }
  }

  revalidatePath("/settings/pricing");
  return { ok: true };
}

/**
 * Inviting somebody to sign in as themselves.
 *
 * Only an owner may do this. Staff being able to hand out logins to a business
 * they do not own is the kind of thing nobody thinks about until it happens.
 *
 * Re-inviting replaces rather than accumulates — a unique index on the pending
 * invite enforces it, so a second link cannot quietly exist alongside a first.
 */
export async function inviteToTeam(
  artistId: string,
): Promise<{ token?: string; error?: string; emailedTo?: string; emailError?: string }> {
  const { studio } = await requireStudio();
  const supabase = await createClient();

  if (!(await isOwner())) {
    return { error: "Only the owner can give somebody a login." };
  }

  const team = await getArtists(studio.id);
  const person = team.find((a) => a.id === artistId);
  if (!person) return { error: "That is not one of your team." };
  if (person.user_id) return { error: `${person.name} already has a login.` };

  // Replace any earlier invite rather than leaving two live links.
  await supabase.from("team_invites").delete().eq("artist_id", artistId).is("accepted_at", null);

  const { data, error } = await supabase
    .from("team_invites")
    .insert({ studio_id: studio.id, artist_id: artistId, role: "staff" })
    .select("token")
    .single();

  if (error) return { error: error.message };

  revalidatePath("/settings/artists");

  /*
   * Sent for them, when we can.
   *
   * The link is still shown either way. Email is the polite way to hand
   * somebody their login, but it is not the reliable one — plenty of these
   * will go over WhatsApp because that is where the team already talks, and
   * the owner should never be stuck waiting on an inbox.
   */
  if (!person.email || !emailConfigured()) return { token: data.token };

  const link = `${await siteOrigin()}/join/${data.token}`;
  const first = person.name.split(" ")[0];

  const sent = await sendEmail({
    to: person.email,
    subject: `Your login for ${studio.name}`,
    text:
      `Hello ${first},

` +
      `${studio.name} has set you up with a login for the diary.

` +
      `${link}

` +
      `The link works once and expires in fourteen days. You will be asked to ` +
      `choose a password when you open it.

` +
      `If you were not expecting this, ignore it and nothing happens.`,
    fromName: studio.name,
    replyTo: studio.email ?? undefined,
  });

  return sent.status === "sent"
    ? { token: data.token, emailedTo: person.email }
    : { token: data.token, emailError: sent.error };
}

/** Cancels a link that has been sent but not used. */
export async function withdrawInvite(artistId: string): Promise<{ error?: string }> {
  await requireStudio();
  const supabase = await createClient();

  if (!(await isOwner())) return { error: "Only the owner can do that." };

  await supabase.from("team_invites").delete().eq("artist_id", artistId).is("accepted_at", null);
  revalidatePath("/settings/artists");
  return {};
}

/** Whether the person signed in owns this business, rather than working in it. */
async function isOwner(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data } = await supabase
    .from("studio_members")
    .select("role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  return data?.role === "owner";
}

/**
 * Registering the number this business texts from.
 *
 * Stored as a channel connection rather than a column on the business, because
 * that is where every other channel lives and because a number can belong to
 * one person rather than the whole shop — the same nullable artist_id that
 * makes a personal Instagram work.
 *
 * The number is also how an incoming text is routed. Two businesses sharing a
 * number would both have a claim on every reply, so it is unique across all of
 * them and saving a duplicate is refused rather than quietly stealing it.
 */
export async function saveSmsNumber(
  _prev: ClientStateLike,
  fd: FormData,
): Promise<ClientStateLike> {
  const { studio } = await requireStudio();
  const supabase = await createClient();

  const raw = String(fd.get("sms_number") ?? "").trim();

  if (!raw) {
    await supabase
      .from("channel_connections")
      .delete()
      .eq("studio_id", studio.id)
      .eq("channel", "sms");
    revalidatePath("/settings/install");
    return { ok: true };
  }

  // Twilio addresses everything in full international form, and a number
  // typed as 07700 900123 will simply never match an incoming webhook.
  const number = raw.replace(/[\s()-]/g, "");
  if (!/^\+[1-9]\d{7,14}$/.test(number)) {
    return {
      error:
        "Use the full international number, starting with +. A UK mobile looks " +
        "like +447700900123.",
    };
  }

  const { data: taken } = await supabase
    .from("channel_connections")
    .select("studio_id")
    .eq("channel", "sms")
    .eq("external_id", number)
    .maybeSingle();

  if (taken && taken.studio_id !== studio.id) {
    return { error: "That number is already in use by another business." };
  }

  const { data: existing } = await supabase
    .from("channel_connections")
    .select("id")
    .eq("studio_id", studio.id)
    .eq("channel", "sms")
    .maybeSingle();

  const { error } = existing
    ? await supabase
        .from("channel_connections")
        .update({ external_id: number, label: number, active: true })
        .eq("id", existing.id)
    : await supabase.from("channel_connections").insert({
        studio_id: studio.id,
        channel: "sms",
        external_id: number,
        label: number,
        active: true,
      });

  if (error) return { error: error.message };

  revalidatePath("/settings/install");
  return { ok: true };
}

type ClientStateLike = { error?: string; ok?: boolean };

/**
 * "I've got this" — and when to stop having it.
 *
 * The one thing this deliberately cannot do is switch the assistant off. Every
 * press carries an end time, because a business that goes quiet is the failure
 * the whole product exists to prevent, and the way that happens in practice is
 * never a decision — it is somebody meaning to turn it back on and then having
 * a busy afternoon.
 *
 * Passing nothing hands it straight back, which is what the same button does
 * when it is already on.
 */
export async function takeTheMessages(hours: number | null): Promise<FormState> {
  const { studio } = await requireStudio();
  const supabase = await createClient();

  const until =
    hours === null
      ? null
      : new Date(Date.now() + Math.min(8, Math.max(1, hours)) * 3600_000).toISOString();

  const { error } = await supabase
    .from("studios")
    .update({ mine_until: until })
    .eq("id", studio.id);

  if (error) return { error: error.message };

  revalidatePath("/");
  revalidatePath("/settings/assistant");
  return { ok: true };
}
