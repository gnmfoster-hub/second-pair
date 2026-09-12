"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireStudio, getArtists } from "@/lib/studio";
import { parsePounds } from "@/lib/money";
import { DEFAULT_HOURS, type DepositRule, type OpeningHours } from "@/lib/types";
import { sendEmail, emailConfigured } from "@/lib/messaging/email";
import { usableAddress } from "@/lib/messaging/address";
import { readInboundMode } from "@/lib/messaging/inboundEmail";
import { siteOrigin } from "@/lib/origin";
import { verticalPack } from "@/lib/verticals";
import { busyFromIcal } from "@/lib/booking/ical";
import { stillWorthAsking } from "@/lib/askedAlready";
import { readNumbers } from "@/lib/channels/phoneNumbers";
import { readHex, autoText } from "@/lib/widget/colour";
import {
  isShape,
  isSize,
  isBubble,
  isPulse,
  isFont,
  isWeight,
  isSurface,
} from "@/lib/widget/look";
import { ticked } from "@/lib/forms";
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

/**
 * The words a business uses, keeping only what it has actually changed.
 *
 * Storing every field would freeze today's pack into the row: improve the
 * wording for salons next year and every salon that ever opened this page
 * would keep the old one, having "chosen" it by pressing Save. Only a genuine
 * difference is kept.
 */
function readVocabulary(
  fd: FormData,
  pack: Record<string, string>,
): Record<string, string> {
  const keys = ["practitioner", "practitioners", "customer", "business"] as const;
  const kept: Record<string, string> = {};

  for (const key of keys) {
    const typed = str(fd, `word_${key}`).trim();
    if (typed && typed.toLowerCase() !== (pack[key] ?? "").toLowerCase()) kept[key] = typed;
  }

  /*
   * An empty object, never null.
   *
   * The column is not null with a default of {}, which the database said the
   * first time this was asked to clear one — so returning null here would have
   * failed every save on this form, not merely the clearing of a word. The
   * absence of an override is an empty set of overrides, which is also the
   * truer description.
   */
  return kept;
}

/**
 * Connecting somebody's own calendar, and checking it before trusting it.
 *
 * The address is read once here rather than only at booking time, because a
 * typo that silently fails is the worst outcome available: the person believes
 * their life is protected, nothing blocks anything, and they find out when
 * somebody is booked over the school run. Better to refuse a bad address while
 * they are looking at the box.
 *
 * Theirs alone. It is found from the signed-in user rather than an id in the
 * form, so nobody can point somebody else's diary at a calendar they control.
 */
export async function savePersonalCalendar(
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const { studio, userId } = await requireStudio();
  const supabase = await createClient();

  const { data: me } = await supabase
    .from("artists")
    .select("id")
    .eq("studio_id", studio.id)
    .eq("user_id", userId)
    .maybeSingle();

  if (!me) return { error: "You are not one of the people in this diary." };

  const url = str(fd, "personal_ical_url").trim();

  if (!url) {
    await supabase
      .from("artists")
      .update({
        personal_ical_url: null,
        personal_calendar_error: null,
        personal_calendar_read_at: null,
      })
      .eq("id", me.id);
    revalidatePath("/settings/you");
    revalidatePath("/diary");
    return { ok: true };
  }

  if (!/^(https?|webcal):\/\//i.test(url)) {
    return { error: "That should start with https:// or webcal://." };
  }

  /*
   * Read it now, over a fortnight, which is enough to prove it is a calendar
   * without waiting for a year of somebody's life to download.
   */
  const from = new Date();
  const to = new Date(from.getTime() + 14 * 86400000);

  try {
    await busyFromIcal(url, from, to);
  } catch (e) {
    return {
      error:
        e instanceof Error
          ? `That address did not work: ${e.message}`
          : "That address did not return a calendar.",
    };
  }

  const { error } = await supabase
    .from("artists")
    .update({
      personal_ical_url: url,
      personal_calendar_show: fd.get("personal_calendar_show") === "on",
      personal_calendar_titles: fd.get("personal_calendar_titles") === "on",
      personal_calendar_error: null,
      personal_calendar_read_at: new Date().toISOString(),
    })
    .eq("id", me.id);

  if (error) return { error: error.message };

  revalidatePath("/settings/you");
  revalidatePath("/diary");
  return { ok: true };
}

export async function updateStudio(_prev: FormState, fd: FormData): Promise<FormState> {
  // The business's own details belongs to the business, so it belongs to its owner.
  if (!(await isOwner())) {
    return { error: "Only the owner can change the business's own details." };
  }

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

  /*
   * Checked here, where somebody can still see what they typed.
   *
   * The URLs beside it have been validated since the day this was written and
   * the address never was — and it is the field that does the most damage. A
   * business typed info@theirfirm.co,uk, a comma where a full stop belonged
   * and invisible at a glance, and it went through to the mail API as the
   * reply-to on every message they sent. The provider refused every one, so
   * not a single customer could be answered, and the only trace was a webhook
   * response nobody was reading.
   */
  const contact = str(fd, "email");
  if (contact && !usableAddress(contact)) {
    return {
      error:
        "That email address does not look right. Check for a stray comma, space or " +
        "full stop — it is where a customer's reply goes, so it has to be exact.",
    };
  }

  const { error } = await supabase
    .from("studios")
    .update({
      name,
      email: usableAddress(contact),
      tone: str(fd, "tone"),
      // Blank means "use the trade pack's wording", not "no greeting".
      greeting: str(fd, "greeting") || null,
      hours: readHours(fd),
      /*
       * What this business calls things, where it differs from its trade.
       *
       * The pack supplies a starting point — a salon gets stylists, a garage
       * gets mechanics — and this is the override for anywhere that is not
       * quite right. A word left blank is removed rather than stored empty, so
       * it falls back to the pack instead of putting nothing where a noun
       * should be.
       *
       * Found by the demo, which is a hair salon carrying the tattoo pack's
       * wording: "artists", doing "tattoos". Nothing could fix that, because
       * nothing could edit it.
       */
      vocabulary: readVocabulary(fd, verticalPack(studio.vertical).vocabulary),
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
  const { studio, userId } = await requireStudio();
  const supabase = await createClient();

  /*
   * The owner, or the person themselves. Nobody else.
   *
   * Every business setting is the owner's, and this one is not quite: a
   * stylist's hours, rates and days off are hers to keep up to date, and
   * making her ask somebody to change them is how they stop being accurate.
   *
   * But it was open to anybody with a login, so one member of staff could
   * change another's rates — or add somebody, or delete them. Adding and
   * removing people is the owner's; changing your own details is yours.
   */
  const target = str(fd, "id");
  const owns = await isOwner();

  if (!owns) {
    if (!target) {
      return { error: "Only the owner can add somebody to the business." };
    }

    const { data: theirs } = await supabase
      .from("artists")
      .select("user_id")
      .eq("id", target)
      .eq("studio_id", studio.id)
      .maybeSingle();

    // Not being able to tell is not permission. A record that will not load is
    // not one to let somebody edit.
    if (!theirs || theirs.user_id !== userId) {
      return { error: "You can only change your own details." };
    }

    if (str(fd, "intent") === "delete") {
      return { error: "Only the owner can remove somebody from the business." };
    }
  }

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
    const { count, error } = await supabase
      .from("artists")
      .select("id", { count: "exact", head: true })
      .eq("studio_id", studio.id);

    /*
     * A limit that cannot be checked is not a limit.
     *
     * This read `count ?? 0`, so a failed query became nought people, nought
     * was under every limit, and the seat cap silently stopped applying — the
     * one check standing between a plan and an unpaid team. Any counting
     * question that cannot be answered has to refuse, not wave things through:
     * the cost of a wrong refusal is somebody rings up, and the cost of a wrong
     * allowance is nobody ever finds out.
     */
    if (error || count == null) {
      return { error: "Could not check how many people your plan covers. Try again." };
    }

    if (count >= studio.seat_limit) {
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

  /*
   * One-off late nights, checked rather than trusted.
   *
   * This decides what the assistant will offer a customer at nine at night, so
   * anything malformed is dropped rather than stored: a backwards or empty
   * entry that reached the slot finder would either do nothing or, worse, be
   * interpreted. Past dates go too — they are notes about a particular
   * evening, and once it has been there is nothing to keep.
   */
  const today = new Date().toISOString().slice(0, 10);
  const extraHours = (() => {
    try {
      const raw: unknown = JSON.parse(str(fd, "extra_hours") || "[]");
      if (!Array.isArray(raw)) return [];
      return raw
        .filter((e): e is { date: string; open: string; close: string } => {
          if (!e || typeof e !== "object") return false;
          const { date, open, close } = e as Record<string, unknown>;
          return (
            typeof date === "string" &&
            /^\d{4}-\d{2}-\d{2}$/.test(date) &&
            date >= today &&
            typeof open === "string" &&
            /^\d{2}:\d{2}$/.test(open) &&
            typeof close === "string" &&
            /^\d{2}:\d{2}$/.test(close) &&
            close > open
          );
        })
        .slice(0, 60)
        .sort((a, b) => a.date.localeCompare(b.date));
    } catch {
      // Malformed means none, never "whatever was there before".
      return [];
    }
  })();

  // Theirs is how they are sent their login, so a typo here locks somebody out
  // of their own account with no message to say why.
  const personal = str(fd, "email");
  if (personal && !usableAddress(personal)) {
    return { error: "That email address does not look right — check for a stray comma or space." };
  }

  const row = {
    studio_id: studio.id,
    name,
    handle,
    email: usableAddress(personal),
    role: str(fd, "role") || null,
    // Blank means "sound like the business", which is what almost everybody
    // wants — so an empty box is null rather than an empty string.
    greeting: str(fd, "greeting") || null,
    tone: str(fd, "tone") || null,
    hours: ownHours,
    extra_hours: extraHours,
    // Checked against the three it can be, so a hand-edited form cannot widen
    // who an assistant will book on somebody's behalf.
    agent_scope: ["only_me", "me_first", "anyone"].includes(str(fd, "agent_scope"))
      ? str(fd, "agent_scope")
      : "only_me",
    styles: fd.getAll("styles").map(String),
    hourly_rate_pence: hourly,
    min_charge_pence: minCharge,
    day_rate_pence: parsePounds(fd.get("day_rate")),
    calendar_id: str(fd, "calendar_id") || null,
    booking_provider: str(fd, "booking_provider") || "native",
    colour: str(fd, "colour") || null,
    ical_url: str(fd, "ical_url") || null,
    booking_url: str(fd, "booking_url") || null,
    active: ticked(fd, "active"),
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
  // Prices belongs to the business, so it belongs to its owner.
  if (!(await isOwner())) {
    return { error: "Only the owner can change prices." };
  }

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
  // Prices belongs to the business, so it belongs to its owner.
  if (!(await isOwner())) {
    return { error: "Only the owner can change prices." };
  }

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
  // The faqs belongs to the business, so it belongs to its owner.
  if (!(await isOwner())) {
    return { error: "Only the owner can change the FAQs." };
  }

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
  // How the assistant behaves belongs to the business, so it belongs to its owner.
  if (!(await isOwner())) {
    return { error: "Only the owner can change how the assistant behaves." };
  }

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

  const replyAddress = str(fd, "email");
  if (replyAddress && !usableAddress(replyAddress)) {
    return {
      error:
        "That email address does not look right. Check for a stray comma, space or " +
        "full stop — it is where a customer's reply goes, so it has to be exact.",
    };
  }

  const { error } = await supabase
    .from("studios")
    .update({
      email: usableAddress(replyAddress),
      inbound_mode: readInboundMode(fd.get("inbound_mode")),
      /*
       * Only addresses that could actually be written to.
       *
       * A line that is not an address would never match anything, so it would
       * silently narrow what gets answered rather than widening it — the
       * failure would look like the assistant ignoring customers.
       */
      inbound_addresses: lines("inbound_addresses")
        .map((one) => usableAddress(one))
        .filter((one): one is string => Boolean(one)),
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
  // Who offers what belongs to the business, so it belongs to its owner.
  if (!(await isOwner())) {
    return { error: "Only the owner can change who offers what." };
  }

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
/**
 * Whether the person signed in owns this business.
 *
 * Used to be checked only on invitations. Everything else — the prices, the
 * assistant's own instructions, the widget on the website, who it will book —
 * could be changed by anybody with a login, so a Saturday junior could alter
 * what the shop charges.
 *
 * Fails closed, and says so out loud rather than quietly: somebody who cannot
 * be verified is not an owner, and telling them what happened is better than
 * a form that appears to save and does not.
 */
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
  // The phone number belongs to the business, so it belongs to its owner.
  if (!(await isOwner())) {
    return { error: "Only the owner can change the phone number." };
  }

  const { studio } = await requireStudio();
  const supabase = await createClient();

  /*
   * Both numbers, and what is wrong with them, in one place.
   *
   * The second is where a call rings before it becomes a text: their own
   * mobile, which is not the number customers dial and is never shown to one.
   * Blank is a real answer, not an unfinished one — do not ring me, text them
   * straight away.
   *
   * The rules live in lib/channels because the back office sets these up for
   * people too, and a support screen looser than this page would let somebody
   * be helped into a number that receives nothing.
   */
  const read = readNumbers(
    String(fd.get("sms_number") ?? ""),
    String(fd.get("forward_to") ?? ""),
  );
  if (!read.ok) return { error: read.error };
  const { number, forwardTo } = read;

  if (!number) {
    await supabase
      .from("channel_connections")
      .delete()
      .eq("studio_id", studio.id)
      .eq("channel", "sms");
    revalidatePath("/settings/install");
    return { ok: true };
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
        .update({ external_id: number, label: number, active: true, forward_to: forwardTo })
        .eq("id", existing.id)
    : await supabase.from("channel_connections").insert({
        studio_id: studio.id,
        channel: "sms",
        external_id: number,
        label: number,
        active: true,
        forward_to: forwardTo,
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
  // When the assistant answers belongs to the business, so it belongs to its owner.
  if (!(await isOwner())) {
    return { error: "Only the owner can change when the assistant answers." };
  }

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

/**
 * How the widget looks on the business's own website.
 *
 * Every value here is handed to a script running on somebody else's page, so
 * each is checked rather than stored as typed. The accent in particular ends
 * up interpolated into a style on their site.
 */
export async function saveWidgetLook(_prev: FormState, fd: FormData): Promise<FormState> {
  // How the widget looks belongs to the business, so it belongs to its owner.
  if (!(await isOwner())) {
    return { error: "Only the owner can change how the widget looks." };
  }

  const { studio } = await requireStudio();
  const supabase = await createClient();

  /*
   * A colour, or nothing at all.
   *
   * Blank clears it back to our own rather than being an error — somebody
   * emptying the box means "use the default", and refusing that would leave
   * them no way to undo a colour they have changed their mind about.
   *
   * `readHex` takes #fff as well as #ffffff, because that is how most people
   * write white and every CSS example ever printed uses it. Being told that
   * white "needs to be six characters" is our problem to solve, not theirs.
   */
  const accentTyped = str(fd, "widget_accent");
  const accent = accentTyped ? readHex(accentTyped) : null;
  if (accentTyped && !accent) {
    return { error: "That button colour is not a colour. Try something like #14243F." };
  }

  const textTyped = str(fd, "widget_text");
  const text = textTyped ? readHex(textTyped) : null;
  if (textTyped && !text) {
    return { error: "That text colour is not a colour. Try something like #FFFFFF." };
  }

  const position = str(fd, "widget_position") === "left" ? "left" : "right";
  const teaser = str(fd, "widget_teaser").trim().slice(0, 140);

  const shape = isShape(str(fd, "widget_shape")) ? str(fd, "widget_shape") : "round";
  const size = isSize(str(fd, "widget_size")) ? str(fd, "widget_size") : "medium";
  const bubble = isBubble(str(fd, "widget_bubble")) ? str(fd, "widget_bubble") : "light";
  const pulse = isPulse(str(fd, "widget_pulse")) ? str(fd, "widget_pulse") : "once";
  const font = isFont(str(fd, "widget_font")) ? str(fd, "widget_font") : "system";
  const weight = isWeight(str(fd, "widget_weight")) ? str(fd, "widget_weight") : "medium";
  const surface = isSurface(str(fd, "widget_surface")) ? str(fd, "widget_surface") : "raised";

  const bubbleFillTyped = str(fd, "widget_bubble_fill");
  const bubbleFill = bubbleFillTyped ? readHex(bubbleFillTyped) : null;
  if (bubbleFillTyped && !bubbleFill) {
    return { error: "That nudge colour is not a colour. Try something like #FFFFFF." };
  }

  const bubbleTextTyped = str(fd, "widget_bubble_text");
  const bubbleText = bubbleTextTyped ? readHex(bubbleTextTyped) : null;
  if (bubbleTextTyped && !bubbleText) {
    return { error: "That nudge text colour is not a colour." };
  }

  /*
   * Their own words on the button, capped where the button runs out.
   *
   * 48 characters is not a rule about writing, it is the width of a 56 pixel
   * pill next to a live dot. Cut here as well as when it is drawn, so what
   * they see saved is what will be shown.
   */
  const lineOpen = str(fd, "widget_line_open").trim().slice(0, 48);
  const lineClosed = str(fd, "widget_line_closed").trim().slice(0, 48);

  const { error } = await supabase
    .from("studios")
    .update({
      widget_accent: accent,
      /*
       * Cleared when it matches what would be chosen anyway.
       *
       * Otherwise a business that picks white on navy is pinned to white, and
       * later changes the button to a pale colour and keeps the white — the
       * setting quietly outliving the reason for it.
       */
      widget_text: text && text !== autoText(accent ?? "14243f") ? text : null,
      widget_position: position,
      widget_teaser: teaser || null,
      widget_enabled: ticked(fd, "widget_enabled"),
      widget_line_open: lineOpen || null,
      widget_line_closed: lineClosed || null,
      widget_shape: shape,
      widget_size: size,
      widget_bubble: bubble,
      widget_pulse: pulse,
      widget_font: font,
      widget_weight: weight,
      widget_surface: surface,
      widget_bubble_fill: bubbleFill,
      /*
       * Cleared when it is the colour that would be chosen anyway, the same
       * as the button's writing. A pinned value that matches the automatic one
       * is a setting waiting to be wrong later.
       */
      widget_bubble_text:
        bubbleText && bubbleText !== autoText(bubbleFill ?? "ffffff") ? bubbleText : null,
    })
    .eq("id", studio.id);

  if (error) return { error: error.message };

  revalidatePath("/settings/install");
  return { ok: true };
}

/**
 * Which people the assistant on the website will offer.
 *
 * Nobody chosen means everybody, which is what every business has today —
 * and is also what the engine falls back to, so the two agree.
 */
export async function saveWhoItOffers(_prev: FormState, fd: FormData): Promise<FormState> {
  // Who the assistant books belongs to the business, so it belongs to its owner.
  if (!(await isOwner())) {
    return { error: "Only the owner can change who the assistant books." };
  }

  const { studio } = await requireStudio();
  const supabase = await createClient();

  const everyone = fd.get("everyone") === "1";
  const picked = fd.getAll("offers").map(String).filter(Boolean);

  /*
   * Checked against their own people.
   *
   * These ids decide whose time is sold on a website, and they arrive from a
   * form. An id belonging to another business would be meaningless here, but
   * storing it would be storing somebody else's identifier in their row.
   */
  const { data: mine } = await supabase
    .from("artists")
    .select("id")
    .eq("studio_id", studio.id);

  const theirs = new Set((mine ?? []).map((a) => a.id));
  const valid = picked.filter((id) => theirs.has(id));

  const { error } = await supabase
    .from("studios")
    .update({ offers_artists: everyone || !valid.length ? null : valid })
    .eq("id", studio.id);

  if (error) return { error: error.message };

  revalidatePath("/settings/install");
  return { ok: true };
}

/**
 * How long enquiries that came to nothing are kept.
 *
 * The law's phrasing is that personal data is kept no longer than is necessary
 * for what it was collected for. Somebody who asked a price in March and never
 * came in stops being necessary at some point, and "never" is not a defensible
 * answer to when.
 *
 * The machinery to forget them has existed since the data review and has never
 * once run, because nothing could set this. It read null for every business on
 * the platform, null means keep everything, and so every price enquiry anybody
 * has ever made is still there. A control nobody can reach is the same as no
 * control at all, only harder to notice.
 *
 * Deliberately not defaulted to a number on everybody's behalf. Choosing to
 * delete a business's records is the business's decision, and one made for
 * them by a silent migration is not a decision they can be said to have taken.
 */
export async function setRetention(_prev: FormState, fd: FormData): Promise<FormState> {
  // What the business keeps is the business's, so it is the owner's.
  if (!(await isOwner())) {
    return { error: "Only the owner can change how long enquiries are kept." };
  }

  const { studio } = await requireStudio();
  const supabase = await createClient();

  const raw = str(fd, "keep_months");

  /*
   * An empty box means keep everything, and is stored as null rather than as
   * a nought — nought months would mean deleting this morning's enquiries
   * tonight, which is the opposite of what an owner clearing the field means
   * by it.
   */
  const months = raw === "" ? null : Number(raw);

  if (months !== null && (!Number.isInteger(months) || months < 6 || months > 120)) {
    return { error: "Choose a number of months between 6 and 120, or leave it empty." };
  }

  const { error } = await supabase
    .from("studios")
    .update({ keep_months: months })
    .eq("id", studio.id);

  if (error) return { error: error.message };

  revalidatePath("/settings/data");
  return { ok: true };
}

/**
 * A fresh calendar link, which is the only way to revoke the old one.
 *
 * The feed is deliberately outside the session — a calendar app cannot sign in
 * — so the token in the URL is the whole credential, and anybody holding it
 * sees a year of the diary: who is booked, their phone number, and whatever
 * was written on the appointment. It is a link that gets pasted into a phone,
 * forwarded to somebody setting it up, and lives on in a shared calendar long
 * after it should.
 *
 * The route has always said the token was rotatable and that rotating it was
 * how a lost subscription is revoked. Nothing in the product could rotate it:
 * the column was read in one place and written nowhere, so a leaked link could
 * not be taken back by anybody short of editing the database by hand. This is
 * that promise, kept.
 *
 * Rotating is not undoable in the sense that matters — every device already
 * subscribed goes quiet and has to be given the new link — so the button says
 * so before it is pressed.
 */
export async function resetCalendarLink(
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const { studio } = await requireStudio();
  const supabase = await createClient();

  const whose = str(fd, "whose");
  const artistId = str(fd, "artist_id");

  /*
   * The business's feed is the whole diary, so it is the owner's. A person's
   * own is theirs, and the owner's too — they can hand somebody a new link
   * without waiting for them to log in and do it themselves.
   */
  if (whose === "studio") {
    if (!(await isOwner())) {
      return { error: "Only the owner can reset the business calendar link." };
    }

    const { error } = await supabase
      .from("studios")
      .update({ calendar_token: freshToken() })
      .eq("id", studio.id);

    if (error) return { error: error.message };
    revalidatePath("/settings/data");
    return { ok: true };
  }

  if (!artistId) return { error: "No calendar to reset." };

  const { data: me } = await supabase
    .from("artists")
    .select("id, user_id")
    .eq("id", artistId)
    .eq("studio_id", studio.id)
    .maybeSingle();

  if (!me) return { error: "That person is not in this business." };

  const { error } = await supabase
    .from("artists")
    .update({ calendar_token: freshToken() })
    .eq("id", me.id);

  if (error) return { error: error.message };

  revalidatePath("/settings/data");
  return { ok: true };
}

/**
 * Sixty-four hex characters, the same shape the database default makes.
 *
 * Generated here rather than by asking Postgres for its default, because that
 * takes a second round trip to produce a value this can make itself.
 */
function freshToken(): string {
  return crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
}

/**
 * The trade's usual reminders, for a business that has none.
 *
 * Every business is given these when it is created, so most never need this.
 * The ones that do are the ones created before that seeding existed, and any
 * business that deletes them and later wants them back — and for those there
 * was no way to get them except to write two of them out by hand, from
 * nothing, guessing what a reminder ought to say.
 *
 * A tattoo studio's says bring photo ID, eat beforehand and go easy the night
 * before. A groomer's asks whether the dog has been clipped recently. That is
 * the part worth having and the part nobody wants to compose on a Tuesday, so
 * it should be one button rather than a blank box.
 *
 * Refuses when there are already some, rather than quietly making a second set
 * of everything.
 */
export async function seedStarterReminders(
  _prev: FormState,
  _fd: FormData,
): Promise<FormState> {
  // What customers are sent in the business's name belongs to its owner.
  if (!(await isOwner())) {
    return { error: "Only the owner can change reminders." };
  }

  const { studio } = await requireStudio();
  const supabase = await createClient();

  const { count } = await supabase
    .from("reminder_templates")
    .select("id", { count: "exact", head: true })
    .eq("studio_id", studio.id);

  if ((count ?? 0) > 0) {
    return { error: "You already have reminders — edit those rather than adding a second set." };
  }

  const pack = verticalPack(studio.vertical);

  const { error } = await supabase.from("reminder_templates").insert(
    pack.reminders.map((r, i) => ({
      studio_id: studio.id,
      label: r.label,
      hours_before: r.hours_before,
      body: r.body,
      enabled: true,
      sort_order: i,
    })),
  );

  if (error) return { error: error.message };

  revalidatePath("/settings/reminders");
  return { ok: true };
}

/**
 * The trade's usual questions, for the ones a business has not answered.
 *
 * Unlike reminders, this does not refuse when some already exist. A business
 * with one answer of its own is the common case and the one that needs this
 * most: Living Canvas had written "Do you do Walk ins?" and had no route to
 * the other three a tattoo studio is asked — aftercare, parking, what to
 * bring — because seeding only ever ran on a business with none at all.
 *
 * What a customer asks and gets no answer to becomes an interruption for the
 * owner, every time, forever. Three blank prompts on a screen is a ten-minute
 * job; working out what the questions are in the first place is not.
 *
 * Matching is deliberately blunt — see lib/askedAlready. A near-duplicate is
 * one click to delete; a question silently withheld is an escalation every
 * time somebody asks it.
 */
export async function seedStarterFaqs(_prev: FormState, _fd: FormData): Promise<FormState> {
  // The answers a business gives are the business's, so they are its owner's.
  if (!(await isOwner())) {
    return { error: "Only the owner can change the FAQs." };
  }

  const { studio } = await requireStudio();
  const supabase = await createClient();

  const { data: have } = await supabase
    .from("faqs")
    .select("question, sort_order")
    .eq("studio_id", studio.id);

  const pack = verticalPack(studio.vertical);
  const missing = stillWorthAsking(
    pack.faqs.map((f) => f.question),
    (have ?? []).map((f) => f.question),
  );

  if (!missing.length) {
    return { error: "You already ask everything your trade usually does." };
  }

  const from = Math.max(0, ...(have ?? []).map((f) => f.sort_order ?? 0)) + 1;

  const { error } = await supabase.from("faqs").insert(
    missing.map((question, i) => ({
      studio_id: studio.id,
      question,
      // Blank on purpose: an unanswered question is never given to the
      // assistant, so these do nothing at all until somebody fills them in.
      answer: "",
      sort_order: from + i,
    })),
  );

  if (error) return { error: error.message };

  revalidatePath("/settings/faqs");
  return { ok: true };
}

/**
 * Taking a Facebook or Instagram connection back.
 *
 * Ours to forget rather than Meta's to revoke: this stops us answering on
 * their behalf and throws the token away. Their account is untouched, and the
 * page says so — somebody who wants the permission gone at Facebook's end too
 * can do that from their own settings, and should be told rather than left to
 * assume we have done it for them.
 */
export async function disconnectMeta(_prev: FormState, fd: FormData): Promise<FormState> {
  if (!(await isOwner())) {
    return { error: "Only the owner can disconnect an account." };
  }

  const { studio } = await requireStudio();
  const supabase = await createClient();
  const id = str(fd, "id");
  if (!id) return { error: "Nothing to disconnect." };

  /*
   * Scoped to their own business.
   *
   * Row-level security would refuse another business's row anyway; naming the
   * studio as well means a wrong id comes back as "not found" rather than as a
   * silent no-op that looks like success.
   */
  const { error, count } = await supabase
    .from("channel_connections")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("studio_id", studio.id)
    .in("channel", ["messenger", "instagram"]);

  if (error) return { error: error.message };
  if (!count) return { error: "That connection has already gone." };

  // The token goes with it: channel_secrets is keyed on the connection and
  // cascades, so there is nothing left to leak.
  revalidatePath("/settings/install");
  return { ok: true };
}
