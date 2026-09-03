"use server";

import { revalidatePath } from "next/cache";
import { seedFromPack } from "@/lib/seed";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPlatformAdmin } from "@/lib/platform";
import { siteOrigin } from "@/lib/origin";

export type Result = { ok?: true; error?: string; note?: string; link?: string };

/**
 * Every action here runs as the service role, which ignores row-level security.
 *
 * So each one begins by asking the server who is calling. Not the page that
 * rendered the button, not a hidden field, not a header — the session, every
 * time. A single missing check here is every business on the platform.
 */
async function guard(): Promise<Result | null> {
  return (await isPlatformAdmin()) ? null : { error: "Not allowed." };
}

const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "business";

/**
 * Set a business up: the owner's login, the business, and the link that lets
 * them in.
 *
 * This is what replaces the sign-up form. Nobody arrives on their own — every
 * business is created here, deliberately, by somebody who has spoken to them.
 *
 * The owner is created without a usable password. They get a link that lets
 * them choose one, which also proves the address works, so there is no separate
 * confirmation email and no account sitting unverified on a typo.
 */
/**
 * A link somebody can actually use.
 *
 * Supabase's own action_link redirects to our callback expecting the browser
 * to finish a code exchange it never started — these links are made on the
 * server by an administrator, so the code verifier that exchange needs exists
 * nowhere. It fails every time and lands on the login page saying "auth",
 * which reads as an expired link rather than an impossible one.
 *
 * Every link this back office hands out goes through here: the one that sets a
 * new business up, and the one that rescues somebody who cannot get in. Both
 * were broken in the same way, and the first of those is the only route into
 * the product, because nobody can sign themselves up.
 */
function redeemable(
  hashedToken: string | undefined,
  origin: string,
  next: string,
): string | undefined {
  if (!hashedToken) return undefined;
  return (
    `${origin}/auth/callback?token_hash=${encodeURIComponent(hashedToken)}` +
    `&type=recovery&next=${encodeURIComponent(next)}`
  );
}

export async function createBusiness(_prev: Result, fd: FormData): Promise<Result> {
  const denied = await guard();
  if (denied) return denied;

  const name = String(fd.get("name") ?? "").trim();
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const vertical = String(fd.get("vertical") ?? "general").trim();

  if (!name) return { error: "The business needs a name." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "That email does not look right." };

  const db = createAdminClient();

  /*
   * A slug nobody else has.
   *
   * It ends up in the widget URL the business puts on its own website, so a
   * collision is not a database error, it is two businesses sharing an inbox.
   */
  let slug = slugify(name);
  const { data: taken } = await db.from("studios").select("slug").like("slug", `${slug}%`);
  if (taken?.some((s) => s.slug === slug)) {
    slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
  }

  // Does this person already have a login? Two businesses under one email is
  // legitimate — somebody with a salon and a barber — so this is not an error.
  const { data: existing } = await db.auth.admin.listUsers();
  let userId = existing?.users.find((u) => u.email?.toLowerCase() === email)?.id ?? null;
  let created = false;

  if (!userId) {
    const { data, error } = await db.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name: String(fd.get("owner") ?? "").trim() || null },
    });
    if (error) return { error: `Could not create the login: ${error.message}` };
    userId = data.user.id;
    created = true;
  }

  const { data: studio, error: studioError } = await db
    .from("studios")
    .insert({ name, slug, vertical, owner_name: String(fd.get("owner") ?? "").trim() || null })
    .select("id, slug")
    .single();

  if (studioError) {
    // Do not leave an orphaned login behind if the business could not be made.
    if (created && userId) await db.auth.admin.deleteUser(userId);
    return { error: `Could not create the business: ${studioError.message}` };
  }

  const { error: memberError } = await db
    .from("studio_members")
    .insert({ studio_id: studio.id, user_id: userId, role: "owner" });

  if (memberError) return { error: `Created, but could not attach the owner: ${memberError.message}` };

  /*
   * The trade's prices, and somebody to do the work.
   *
   * Without these a business exists and cannot answer anybody: no price bands
   * means no quote, no person means nothing to book. Every business created
   * here arrived in exactly that state, which is why the attention panel above
   * has spent weeks reporting that they could not answer anybody — it was
   * right, and the cause was this screen rather than anything the owner had
   * failed to do.
   *
   * Signing up through the front door has always seeded both. There is no
   * front door any more — sign-up is invitation-only, so this is the only way
   * a business is ever made, and it was the half that did not do it.
   */
  await seedFromPack(db, studio.id, vertical);

  const ownerName = String(fd.get("owner") ?? "").trim();
  const { error: artistError } = await db.from("artists").insert({
    studio_id: studio.id,
    // Their own name if we were given one; otherwise the business's, which is
    // right far more often than not for one person working alone.
    name: ownerName || name,
    hourly_rate_pence: 5000,
    min_charge_pence: 3000,
    active: true,
    booking_provider: "native",
  });

  /*
   * Said out loud rather than swallowed. A business with prices and no person
   * looks completely normal on every screen and cannot book anything, and the
   * way that surfaces is a customer being told nothing at all.
   */
  if (artistError) {
    return {
      error:
        `${name} was created, but nobody could be added to it: ${artistError.message}. ` +
        "Add a person in their settings before sending them the link.",
    };
  }

  const origin = await siteOrigin();
  const { data: link } = await db.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: `${origin}/auth/callback?next=/onboarding` },
  });

  revalidatePath("/admin");
  return {
    ok: true,
    /*
     * What is done and what is not, because the difference decides whether
     * the assistant can answer anybody the moment the link is opened.
     */
    note: created
      ? `${name} is set up with its trade's prices, FAQs and reminders, and ${ownerName || name} ` +
        "added as the first person. Only the opening hours are missing — nobody but them knows " +
        "those. Send them the link below to choose a password."
      : `${name} is set up under an existing login, so they sign in as they already do.`,
    /*
     * A password first, then their business.
     *
     * The account is made with no password — there is nobody to choose one at
     * the time — so this link was the only chance to set it, and it went
     * straight to onboarding, which never asks. An owner set their business
     * up, closed the browser, and could never sign in again: there was no
     * password to sign in with, and getting one needed email, which is the
     * thing that is not switched on yet.
     *
     * The button has always said "send them the link below to choose a
     * password". Now it does that.
     */
    link: created
      ? redeemable(link?.properties?.hashed_token, origin, "/reset-password?next=/settings/pricing")
      : undefined,
  };
}

/**
 * A fresh link for somebody who cannot get in.
 *
 * Generated rather than emailed, so it can be handed over on the phone while
 * they are on it — which is the situation this is for, and it does not depend
 * on our email being set up or their spam filter being kind.
 */
export async function resetLink(_prev: Result, fd: FormData): Promise<Result> {
  const denied = await guard();
  if (denied) return denied;

  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  if (!email) return { error: "No email on that owner." };

  const db = createAdminClient();
  const origin = await siteOrigin();
  const { data, error } = await db.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: `${origin}/auth/callback?next=/reset-password` },
  });

  if (error) return { error: error.message };

  /*
   * Our own address, carrying the hashed token — not Supabase's action link.
   *
   * The action link redirects here expecting the browser to finish a code
   * exchange it never started: the link was made on the server by an
   * administrator, so no code verifier exists anywhere, and the exchange fails
   * every single time. It landed on the login page saying "auth", which reads
   * as an expired link, which is the one thing it never was.
   */
  return {
    ok: true,
    note: `A link for ${email}. It works once.`,
    link: redeemable(data?.properties?.hashed_token, origin, "/reset-password"),
  };
}

/**
 * Delete a business and everything belonging to it.
 *
 * Irreversible, and it takes real customers' conversations with it, so it asks
 * for the name to be typed out. A confirmation somebody can dismiss by reflex
 * is not a confirmation.
 *
 * The owner's login is left alone. It may belong to another business, and a
 * person is not a business.
 */
export async function deleteBusiness(_prev: Result, fd: FormData): Promise<Result> {
  const denied = await guard();
  if (denied) return denied;

  const id = String(fd.get("id") ?? "");
  const typed = String(fd.get("confirm") ?? "").trim();

  const db = createAdminClient();
  const { data: studio } = await db.from("studios").select("name").eq("id", id).maybeSingle();
  if (!studio) return { error: "That business no longer exists." };

  if (typed !== studio.name) {
    return { error: `Type the name exactly — ${studio.name} — to delete it.` };
  }

  const { error } = await db.from("studios").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin");
  return { ok: true, note: `${studio.name} is gone, with everything belonging to it.` };
}

/**
 * What a customer is on, what they pay, and how many people they may have.
 *
 * The seat limit is the one with teeth: without it an owner adds their whole
 * team and the price stays the same, which is not a plan, it is a donation. It
 * is checked where somebody is added rather than here, so raising it takes
 * effect immediately and lowering it never locks anybody out of a person they
 * already have.
 */
export async function saveAccount(_prev: Result, fd: FormData): Promise<Result> {
  const denied = await guard();
  if (denied) return denied;

  const id = String(fd.get("id") ?? "");
  if (!id) return { error: "No business." };

  const pounds = String(fd.get("price") ?? "").trim();
  const pence = pounds === "" ? 0 : Math.round(Number(pounds) * 100);
  if (!Number.isFinite(pence) || pence < 0) return { error: "That price does not look right." };

  const seatsRaw = String(fd.get("seats") ?? "").trim();
  const seats = seatsRaw === "" ? null : Number(seatsRaw);
  if (seats !== null && (!Number.isInteger(seats) || seats < 1)) {
    return { error: "Seats must be a whole number, or blank for no limit." };
  }

  const status = String(fd.get("status") ?? "trial");
  if (!["trial", "active", "overdue", "paused", "closed"].includes(status)) {
    return { error: "Unknown status." };
  }

  const started = String(fd.get("started") ?? "").trim() || null;

  /*
   * Channels are entitlements, like seats.
   *
   * The web widget is always on: it costs nothing extra to run and a business
   * without it has nothing at all. Everything else is something somebody agreed
   * to, and can be charged for differently.
   */
  const channels = ["web", ...fd.getAll("channel").map(String)].filter(
    (c, i, all) => all.indexOf(c) === i,
  );

  const db = createAdminClient();
  const { error } = await db
    .from("studios")
    .update({
      channels_allowed: channels,
      plan: String(fd.get("plan") ?? "").trim() || null,
      plan_pence: pence,
      seat_limit: seats,
      account_status: status,
      billing_started_on: started,
      account_note: String(fd.get("note") ?? "").trim() || null,
      owner_name: String(fd.get("owner_name") ?? "").trim() || null,
      owner_phone: String(fd.get("owner_phone") ?? "").trim() || null,
      trial_ends_on: String(fd.get("trial_ends") ?? "").trim() || null,
    })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/admin");
  return { ok: true, note: "Saved." };
}

/**
 * Fixing a business's settings for them, from here.
 *
 * The support call is almost always the same: something is not answering, and
 * the reason is a setting. Talking somebody through Settings → Assistant while
 * they are between clients is slow and goes wrong; doing it while they describe
 * the problem does not.
 *
 * Deliberately settings only. This cannot open a conversation, read a customer's
 * name or look at a diary — the same boundary the rest of the suite keeps, and
 * the reason the privacy notice can go on telling every customer that nobody
 * else reads what they wrote. A business's opening hours are the business's own
 * configuration; their customer's message is somebody else's.
 */
export async function fixSettings(_prev: Result, fd: FormData): Promise<Result> {
  const denied = await guard();
  if (denied) return denied;

  const id = String(fd.get("id") ?? "");
  if (!id) return { error: "No business." };

  const patch: Record<string, unknown> = {};

  const name = String(fd.get("name") ?? "").trim();
  if (name) patch.name = name;

  const timezone = String(fd.get("timezone") ?? "").trim();
  if (timezone) patch.timezone = timezone;

  const tone = String(fd.get("tone") ?? "").trim();
  patch.tone = tone;

  const deposit = String(fd.get("deposit_mode") ?? "").trim();
  if (["required", "optional", "none"].includes(deposit)) patch.deposit_mode = deposit;

  /*
   * Everything else a business is configured by, in one place.
   *
   * Not because a support call needs all of it, but because the one it needs
   * is never the one you built a field for — and talking somebody through
   * their own settings while they are between clients is exactly what this
   * exists to avoid.
   *
   * A blank string means "clear it" for the optional ones and "leave it" for
   * the required ones, which is why they are handled separately rather than in
   * a loop.
   */
  /*
   * Some of these columns cannot hold null.
   *
   * Blanking a box wrote null into every one of them, and two — tone and the
   * cancellation policy — are declared not-null. Postgres rejected the
   * statement, and because an update is all-or-nothing the error came back
   * against whatever the person had actually come to change. Somebody fixing a
   * business's opening hours was told the hours had failed; the hours were
   * fine, an empty box three fields away was not.
   *
   * So blank means the empty string where the column demands one, and null
   * where null is the honest answer — a URL that has not been set is absent,
   * not empty.
   */
  const NEVER_NULL = new Set(["tone", "cancellation_policy"]);

  const text = (key: string, column = key) => {
    if (!fd.has(key)) return;
    const value = String(fd.get(key) ?? "").trim();
    patch[column] = value || (NEVER_NULL.has(column) ? "" : null);
  };

  const number = (key: string, column = key, least = 0, most = 100000) => {
    if (!fd.has(key)) return;
    const value = Number(String(fd.get(key) ?? "").trim());
    if (Number.isFinite(value)) patch[column] = Math.min(most, Math.max(least, value));
  };

  const lines = (key: string, column = key) => {
    if (!fd.has(key)) return;
    patch[column] = String(fd.get(key) ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 30);
  };

  text("greeting");
  text("cancellation_policy");
  text("privacy_notice_url");
  text("terms_url");
  text("email");
  text("stripe_account_id");
  text("vat_number");

  lines("always_mention");
  lines("never_mention");
  lines("escalate_when");
  lines("service_areas");

  number("first_refusal_minutes", "first_refusal_minutes", 1, 60);
  number("notice_hours", "notice_hours", 0, 720);
  number("consultation_minutes", "consultation_minutes", 5, 480);
  number("max_session_minutes", "max_session_minutes", 15, 1440);
  number("travel_buffer_minutes", "travel_buffer_minutes", 0, 240);
  number("vat_rate_percent", "vat_rate_percent", 0, 100);

  if (fd.has("vat_registered")) patch.vat_registered = fd.get("vat_registered") === "on";
  if (fd.has("prices_include_vat")) patch.prices_include_vat = fd.get("prices_include_vat") === "on";

  const travel = String(fd.get("travel_mode") ?? "").trim();
  if (["at_premises", "at_customer", "both"].includes(travel)) patch.travel_mode = travel;

  const colour = String(fd.get("diary_colour") ?? "").trim();
  if (["category", "client", "person"].includes(colour)) patch.diary_colour = colour;

  /*
   * The deposit rule is one column holding two different shapes, so it is
   * rebuilt rather than patched — writing half of it would leave a rule that
   * charges nothing or charges everything.
   */
  const rule = String(fd.get("deposit_rule_type") ?? "").trim();
  if (rule === "fixed") {
    patch.deposit_rule = {
      type: "fixed",
      amount_pence: Math.round(Number(fd.get("deposit_amount") ?? 0) * 100) || 0,
    };
  } else if (rule === "percent") {
    patch.deposit_rule = {
      type: "percent",
      percent: Math.min(100, Math.max(0, Number(fd.get("deposit_percent") ?? 0))),
      min_pence: Math.round(Number(fd.get("deposit_floor") ?? 0) * 100) || 0,
    };
  }

  const mode = String(fd.get("answering_mode") ?? "").trim();
  if (["always", "when_free", "always_ask_me"].includes(mode)) patch.answering_mode = mode;

  /*
   * Opening hours, which is the setting that breaks most often — an assistant
   * with none cannot offer a time, and that is the whole product.
   *
   * All seven days or none: a partial update would leave a business open on
   * days it had said it was shut, which is worse than not touching them.
   */
  const days = fd.getAll("day").map(String);
  if (days.length === 7) {
    patch.hours = days.map((day) => ({
      day: Number(day),
      open: String(fd.get(`open_${day}`) ?? "09:00"),
      close: String(fd.get(`close_${day}`) ?? "17:00"),
      closed: fd.get(`closed_${day}`) === "on",
    }));
  }

  const db = createAdminClient();
  const { error } = await db.from("studios").update(patch).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin");
  return { ok: true, note: "Changed. It takes effect on their next enquiry." };
}

/**
 * Answering somebody, and saying when it is done.
 *
 * The reply lands in their own account rather than an email, which means it is
 * still there in six months when they wonder what was agreed — and it means
 * nobody had to go into their business and read their customers' messages to
 * work out what they were talking about.
 */
export async function answerTicket(_prev: Result, fd: FormData): Promise<Result> {
  const denied = await guard();
  if (denied) return denied;

  const id = String(fd.get("ticket_id") ?? "");
  const body = String(fd.get("body") ?? "").trim();
  const andClose = fd.get("close") === "true";

  if (!id) return { error: "No request." };
  if (!body && !andClose) return { error: "Nothing to send." };

  const db = createAdminClient();

  if (body) {
    const { error } = await db
      .from("support_messages")
      .insert({ ticket_id: id, author: "support", body });
    if (error) return { error: error.message };
  }

  /*
   * Closing without a word is allowed but discouraged by the wording of the
   * button, not by refusing it: sometimes the fix is obvious and the owner
   * already knows, and forcing a message would only produce "done".
   */
  const now = new Date().toISOString();
  const { error } = await db
    .from("support_tickets")
    .update({
      status: andClose ? "closed" : "answered",
      answered_at: body ? now : undefined,
      closed_at: andClose ? now : null,
      updated_at: now,
    })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/admin");
  return { ok: true, note: andClose ? "Answered and closed." : "Sent." };
}

/**
 * Whether a business counts.
 *
 * Everything on this screen counted demos and test junk alongside real
 * customers, so "15 businesses" and "£1,750 won" were numbers nobody could
 * quote at a prospect without being wrong.
 *
 * Three kinds rather than a delete: a demonstration is worth keeping, it is
 * what you show somebody on a call, and removing it to tidy a total would be
 * losing something useful to fix a counting problem.
 */
export async function setKind(_prev: Result, fd: FormData): Promise<Result> {
  const denied = await guard();
  if (denied) return denied;

  const id = String(fd.get("id") ?? "");
  const kind = String(fd.get("kind") ?? "");
  if (!id) return { error: "No business." };
  if (!["customer", "demo", "internal"].includes(kind)) return { error: "Unknown kind." };

  const db = createAdminClient();
  const { error } = await db.from("studios").update({ kind }).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin");
  return { ok: true, note: kind === "customer" ? "Counted as a customer." : `Marked as ${kind}.` };
}

/**
 * Put an inferred problem down for a week.
 *
 * Not a dismiss. Something genuinely broken comes back and asks again — a
 * permanent one would let a business that cannot answer anybody vanish off the
 * only screen that would have told you.
 *
 * Requests are never affected. A person who typed something is not a guess
 * this can be wrong about.
 */
export async function snoozeAttention(_prev: Result, fd: FormData): Promise<Result> {
  const denied = await guard();
  if (denied) return denied;

  const id = String(fd.get("id") ?? "");
  if (!id) return { error: "No business." };

  const until = new Date();
  until.setDate(until.getDate() + 7);

  const db = createAdminClient();
  const { error } = await db
    .from("studios")
    .update({ attention_snoozed_until: until.toISOString().slice(0, 10) })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin");
  return { ok: true, note: "Back in a week if it is still like that." };
}
