"use server";

import { revalidatePath } from "next/cache";
import { seedFromPack } from "@/lib/seed";
import { createAdminClient } from "@/lib/supabase/admin";
import { userByEmail } from "@/lib/auth/everyUser";
import { readNumbers } from "@/lib/channels/phoneNumbers";
import { isPlatformAdmin } from "@/lib/platform";
import { hasColumn } from "@/lib/db/hasColumn";
import { takesCalls } from "@/lib/voice/takesCalls";
import { siteOrigin } from "@/lib/origin";
import { refreshDemo } from "@/lib/demo/refresh";

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
  const existing = await userByEmail(db, email);
  let userId = existing?.id ?? null;
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
    /*
     * The owner is a person in the business, not just a login.
     *
     * Accepting an invitation links a login to the person record it was sent
     * for — so every member of staff is joined up, and the one who founded the
     * business was not. Dave Bone owned Living Canvas and the system had no
     * idea that the login and the tattooist were the same man: his own diary
     * was somebody else's as far as the product was concerned, and nothing
     * could say who the owner was.
     */
    user_id: userId,
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
        "added as the first person. Only the opening hours are missing, and nobody but them knows " +
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
/**
 * Stop a business without destroying it.
 *
 * The only way to end a relationship was to delete the studio outright, taking
 * every conversation, booking and client with it, permanently. Most reasons
 * for stopping are not permanent — a salon goes quiet over winter, somebody
 * stops paying and then pays — and none are worth losing a year of their
 * bookings over.
 *
 * Archived means the assistant refuses to answer and they leave every figure
 * and list, while everything they had stays where it is. Reversible on any
 * day.
 */
/**
 * Open the demo business, signed in, in one click.
 *
 * Judging a screen means looking at the same screen as whoever is describing
 * it, and until now that meant building a business, reading a password out,
 * and deleting it afterwards — so every design conversation started with two
 * people looking at different things.
 *
 * A magic link rather than a password reset: it signs you in and changes
 * nothing, and it is spent the moment it is used. Nothing here becomes a
 * standing way into an account.
 *
 * Refused for anything that is not marked as a demo, checked here in the
 * action rather than trusted from the page that called it. This is a signed-in
 * session for somebody else's account, and the whole reason it is safe is that
 * a demo has no real customers in it — the moment it would work on a customer,
 * it is a back door into a salon's client list.
 */
/**
 * Put the demo back to today.
 *
 * Its week is built around this Monday and its inbox is timed in minutes-ago,
 * so a fortnight later it is a salon with an empty diary whose newest enquiry
 * is from last Tuesday — and somebody being shown that draws conclusions about
 * the product from it. Until now the only way to fix that was a checkout, a
 * terminal and the service key, which meant it happened when somebody was at
 * their desk rather than before it was shown to anybody.
 *
 * The refusal for anything that is not a demo is inside refreshDemo, against
 * the row it just read, rather than here: this deletes a week of appointments
 * and every conversation, and a button is one wrong id away from doing that to
 * a real business.
 */
export async function rebuildDemo(_prev: Result, fd: FormData): Promise<Result> {
  const denied = await guard();
  if (denied) return denied;

  const id = String(fd.get("id") ?? "").trim();
  if (!id) return { error: "No business." };

  try {
    const out = await refreshDemo(createAdminClient(), id);
    revalidatePath("/admin");
    return {
      note:
        `Rebuilt: ${out.appointments} appointments this week, ${out.history} behind it, ` +
        `${out.sales} counter sales, ${out.conversations} conversations, ${out.messages} ` +
        `messages. All dated from today.`,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "It would not rebuild." };
  }
}

export async function openDemo(_prev: Result, fd: FormData): Promise<Result> {
  const denied = await guard();
  if (denied) return denied;

  const id = String(fd.get("id") ?? "").trim();
  if (!id) return { error: "No business." };

  const db = createAdminClient();

  const { data: studio } = await db
    .from("studios")
    .select("id, name, kind")
    .eq("id", id)
    .maybeSingle();

  if (!studio) return { error: "That business is not here any more." };

  if (studio.kind !== "demo") {
    return {
      error:
        `${studio.name} is not a demo. This only ever opens a demo, because it signs ` +
        "you in as somebody else and a real business has real customers in it.",
    };
  }

  /*
   * Whose view to open.
   *
   * The demo has four logins and this could only ever reach one of them. The
   * other three — a stylist renting her chair, an employee whose settings the
   * business keeps, and somebody on the desk with no column in the diary —
   * were created by a script, wired up properly, and reachable by nothing: the
   * three views a salon actually asks about, and the owner's is the least
   * interesting of the four because it is the only one where nothing is
   * decided for you.
   *
   * Named by user id and checked against this studio's own membership. Not by
   * email, and never taken on trust: this hands somebody a signed-in session,
   * and "the id was in a hidden field" is not a permission check.
   */
  const wanted = String(fd.get("as") ?? "").trim();

  const { data: member } = wanted
    ? await db
        .from("studio_members")
        .select("user_id")
        .eq("studio_id", studio.id)
        .eq("user_id", wanted)
        .maybeSingle()
    : await db
        .from("studio_members")
        .select("user_id")
        .eq("studio_id", studio.id)
        .eq("role", "owner")
        .limit(1)
        .maybeSingle();

  if (!member) {
    return {
      error: wanted
        ? "That person does not work at the demo."
        : "That demo has no owner to sign in as.",
    };
  }

  const { data: user } = await db.auth.admin.getUserById(member.user_id);
  const email = user?.user?.email;
  if (!email) return { error: "That login has no email to send a link to." };

  const origin = await siteOrigin();
  const { data, error } = await db.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: `${origin}/auth/callback?next=/diary` },
  });

  if (error) return { error: error.message };

  const hashed = data?.properties?.hashed_token;
  if (!hashed) return { error: "No link came back." };

  return {
    ok: true,
    note: `Opens ${studio.name} signed in, on the diary. Works once.`,
    link:
      `${origin}/auth/callback?token_hash=${encodeURIComponent(hashed)}` +
      `&type=magiclink&next=${encodeURIComponent("/diary")}`,
  };
}

export async function archiveBusiness(_prev: Result, fd: FormData): Promise<Result> {
  const denied = await guard();
  if (denied) return denied;

  const id = String(fd.get("id") ?? "");
  const restoring = fd.get("restore") === "1";
  if (!id) return { error: "No business." };

  const db = createAdminClient();
  const { data: studio } = await db.from("studios").select("name").eq("id", id).maybeSingle();
  if (!studio) return { error: "That business no longer exists." };

  const { error } = await db
    .from("studios")
    .update({ archived_at: restoring ? null : new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin");
  return {
    ok: true,
    note: restoring
      ? `${studio.name} is back on. The assistant is answering for them again.`
      : `${studio.name} is stopped. Nothing is lost, and the assistant has stopped answering. Take the script off their site when you can.`,
  };
}

export async function deleteBusiness(_prev: Result, fd: FormData): Promise<Result> {
  const denied = await guard();
  if (denied) return denied;

  const id = String(fd.get("id") ?? "");
  const typed = String(fd.get("confirm") ?? "").trim();

  const db = createAdminClient();
  const { data: studio } = await db
    .from("studios")
    .select("name, archived_at, kind")
    .eq("id", id)
    .maybeSingle();
  if (!studio) return { error: "That business no longer exists." };

  if (typed !== studio.name) {
    return { error: `Type the name exactly — ${studio.name} — to delete it.` };
  }

  /*
   * A customer has to be stopped first. A demonstration does not.
   *
   * Two deliberate acts on different days is the right price for deleting
   * somebody's business: archiving does everything ending a relationship
   * actually requires — they stop being served, they leave the figures — so
   * there is never a reason to need both in the same minute, and a mistake
   * made in the same minute is the one nobody recovers from.
   *
   * None of that applies to a demo or to one of ours. There is no
   * relationship to end and nobody to lose, and the ceremony was being paid on
   * exactly the rows that most want clearing out: seeded twice, named "Teat
   * business", left over from testing an invite. Making somebody stop a
   * duplicate before they may delete it protects nothing and reads as the
   * product refusing to tidy up after itself.
   */
  if (studio.kind === "customer" && !studio.archived_at) {
    return {
      error:
        `${studio.name} is still live. Stop them first, then deleting is a separate ` +
        "decision, and everything of theirs survives in the meantime.",
    };
  }

  /*
   * Appointments go first, by hand.
   *
   * Everything else falls away with the business — every table pointing at a
   * studio cascades. Bookings do not: they point at the artist, and that link
   * is `on delete restrict`, deliberately, so that removing a stylist can
   * never quietly take her diary with her. Postgres checks a restrict
   * immediately rather than at the end of the statement, so it fires even
   * though the same delete would have removed those bookings a moment later
   * by another route.
   *
   * The result was that deleting any business anybody had ever booked into
   * failed with a raw foreign key error from the database, which is both
   * frightening and useless to read. Reminders hang off bookings and cascade,
   * so they need no help.
   */
  const { data: people } = await db.from("artists").select("id").eq("studio_id", id);
  const artistIds = (people ?? []).map((a) => a.id);

  if (artistIds.length) {
    const { error: bookings } = await db
      .from("bookings")
      .delete()
      .in("artist_id", artistIds);

    if (bookings) {
      return { error: `Could not remove their appointments: ${bookings.message}` };
    }
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

  /* A ceiling on texts. Blank, nought or nonsense all mean no ceiling. */
  const capRaw = String(fd.get("sms_cap") ?? "").trim();
  const capNumber = Number(capRaw);
  const smsCap =
    capRaw && Number.isFinite(capNumber) && capNumber > 0 ? Math.round(capNumber) : null;

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
      /*
       * Blank means no ceiling, which is every business today. Guarded on the
       * column so a deploy before the migration saves the rest of the account
       * rather than failing all of it.
       */
      ...((await hasColumn(db, "studios", "sms_monthly_cap"))
        ? { sms_monthly_cap: smsCap }
        : {}),
      ...((await hasColumn(db, "studios", "allow_both_channels"))
        ? { allow_both_channels: fd.get("allow_both") === "on" }
        : {}),
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
/**
 * Fixing one person's settings, from the back office.
 *
 * The console could reach a business's own settings and its channels, and
 * nothing at all below that. So a support call about a stylist — her rate is
 * wrong, her calendar will not connect, her reminders are going out as the
 * shop's — meant talking an owner through screens rather than fixing it, which
 * is slower and worse for exactly the people least likely to find the screen.
 *
 * Settings only, and that line is deliberate. This console has never been able
 * to read a conversation and still cannot: the privacy notice tells every
 * customer of every business that nobody else on Second Pair can see what they
 * wrote, and a support screen that could would make that sentence false for all
 * of them at once. Configuration is a different thing, and helping with it is
 * what support is.
 */
export async function fixPerson(_prev: Result, fd: FormData): Promise<Result> {
  const denied = await guard();
  if (denied) return denied;

  const id = String(fd.get("artist_id") ?? "").trim();
  if (!id) return { error: "No person." };

  const db = createAdminClient();

  const { data: person } = await db
    .from("artists")
    .select("id, studio_id, name")
    .eq("id", id)
    .maybeSingle();

  if (!person) return { error: "No such person." };

  const patch: Record<string, unknown> = {};

  const text = (key: string, column = key) => {
    const value = String(fd.get(key) ?? "").trim();
    if (value) patch[column] = value;
  };

  const money = (key: string, column = key) => {
    const raw = String(fd.get(key) ?? "").trim();
    if (raw === "") return;
    const pounds = Number(raw.replace(/[£,\s]/g, ""));
    if (Number.isFinite(pounds) && pounds >= 0) patch[column] = Math.round(pounds * 100);
  };

  text("name");
  text("role");
  text("email");
  money("hourly_rate", "hourly_rate_pence");
  money("min_charge", "min_charge_pence");

  /*
   * The switches, read as present-or-absent rather than on-or-off.
   *
   * A checkbox that is off is simply not submitted, so reading them straight
   * would turn every unticked box into a deliberate false — and a support form
   * that silently switches somebody's notifications off while fixing their rate
   * is worse than no support form.
   */
  if (fd.get("touch_switches") === "1") {
    patch.active = fd.get("active") === "on";
    patch.owner_managed = fd.get("owner_managed") === "on";
    patch.notify_own_bookings = fd.get("notify_own_bookings") === "on";
    patch.reminders_own = fd.get("reminders_own") === "on";

    /*
     * Their own telephone, which is a thing sold rather than a thing chosen.
     *
     * Giles: per person would be expensive, so I will need to charge for each
     * individual instance. So it is switched on here, beside the other
     * entitlements, and what it costs shows against their name in Reports —
     * which is the other half of what he asked for and the half that decides
     * whether the price works.
     *
     * Guarded on the column: a deploy lands before its migration, and a
     * support form that refuses to save a rate because of a telephone column
     * is worse than one that quietly leaves the telephone alone.
     */
    if (await hasColumn(db, "artists", "voice_on")) {
      patch.voice_on = fd.get("voice_on") === "on";
    }
  }

  const travel = String(fd.get("travel_buffer_minutes") ?? "").trim();
  if (travel !== "") {
    const n = Number(travel);
    if (Number.isFinite(n) && n >= 0 && n <= 240) patch.travel_buffer_minutes = Math.round(n);
  }

  const ical = String(fd.get("personal_ical_url") ?? "").trim();
  if (fd.get("touch_calendar") === "1") {
    patch.personal_ical_url = ical || null;
    if (!ical) {
      patch.personal_calendar_error = null;
      patch.personal_calendar_read_at = null;
    }
  }

  if (Object.keys(patch).length === 0) return { error: "Nothing to change." };

  const { error } = await db.from("artists").update(patch).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin");
  return { ok: true, note: `${person.name} updated.` };
}

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

/**
 * Setting a business's text number up for them.
 *
 * The one channel that genuinely needs talking through. The widget needs
 * nothing, and Meta's three are blocked on a review, but a phone number has to
 * be bought from Twilio, typed in a format nobody uses in conversation, and
 * pasted into two webhook boxes — and if any of that is a character out, texts
 * do not arrive and nothing anywhere says so.
 *
 * Deliberately the same rules as the owner's own page rather than looser ones.
 * A number typed here that a webhook will never match is worse than one typed
 * there, because the person who typed it is not the person it fails for.
 */
/**
 * Give a number to one of their people, or hand it back to the business.
 *
 * Giles, asked where he allocates numbers in the back office: he could not.
 * The panel held one number per business and never recorded whose it was, so
 * the per-person channels this product has been built around could not be set
 * up by the one person able to buy a number.
 *
 * The rule this is the other half of: a connection with no artist_id belongs
 * to the business and the assistant asks the customer who they would like; one
 * with an artist_id is that person's, and it never asks, because everything
 * arriving there is theirs.
 *
 * Here as well as on the owner's own settings, not instead of. The owner
 * assigning from the numbers they have is the normal way round and keeps Giles
 * out of it. This is for the owner who would rather not, which is what he
 * asked for in those words.
 */
export async function assignNumber(_prev: Result, fd: FormData): Promise<Result> {
  const denied = await guard();
  if (denied) return denied;

  const connectionId = String(fd.get("connection") ?? "");
  if (!connectionId) return { error: "No number." };

  /* Empty means the business's, which is a real answer and the default. */
  const artistId = String(fd.get("artist") ?? "").trim() || null;

  const db = createAdminClient();

  const { data: connection } = await db
    .from("channel_connections")
    .select("id, studio_id")
    .eq("id", connectionId)
    .maybeSingle();

  if (!connection) return { error: "That number is no longer there." };

  /*
   * The person has to be on this business.
   *
   * This screen sees every business at once, which is exactly what makes the
   * mistake possible: an id from the row above would point a salon's number at
   * a stylist in another town, and every enquiry arriving on it would be
   * booked into her diary.
   */
  if (artistId) {
    const { data: person } = await db
      .from("artists")
      .select("id, active")
      .eq("id", artistId)
      .eq("studio_id", connection.studio_id)
      .maybeSingle();

    if (!person) return { error: "That person is not on this business." };

    /*
     * Somebody who has left keeps nothing pointed at them. They are off the
     * diary and out of the list the assistant offers, so a line routed to them
     * rings a chair nobody sits in, and the assistant never asks who, because
     * it has been told it already knows.
     */
    if (person.active === false) {
      return { error: "That person is not working there at the moment." };
    }
  }

  const { data: written, error } = await db
    .from("channel_connections")
    .update({ artist_id: artistId })
    .eq("id", connectionId)
    .select("id");

  if (error) return { error: error.message };
  // Asked for the row back, so "nothing matched" is not read as a save.
  if (!written?.length) return { error: "That could not be changed. Try again." };

  revalidatePath("/admin");
  return { ok: true };
}

/**
 * Where a line rings before it becomes a text, set from here.
 *
 * Giles: there should be a box for their number if they have one. There is one
 * on the owner's own settings for the business's line, and one now on a
 * person's own page for hers, and both assume somebody who knows what they are
 * doing. This is the same box for the owner who does not: a number is allocated
 * and pointed at the right phone in the same two presses, at the same moment,
 * on the screen where the allocating happens.
 *
 * Nothing is read differently here. readNumbers is the same reader both
 * settings pages use, so a number typed the way it is written on a card is
 * accepted in all three, and the one mistake worth catching — a line pointed at
 * itself, ringing forever and billing both legs — is caught in all three.
 */
export async function setForwarding(_prev: Result, fd: FormData): Promise<Result> {
  const denied = await guard();
  if (denied) return denied;

  const connectionId = String(fd.get("connection") ?? "");
  if (!connectionId) return { error: "No number." };

  const db = createAdminClient();

  const { data: connection } = await db
    .from("channel_connections")
    .select("id, external_id, studios(channels_allowed)")
    .eq("id", connectionId)
    .maybeSingle();

  if (!connection) return { error: "That number is no longer there." };

  /*
   * Said rather than quietly saved. Without the telephone a call is answered by
   * saying the number takes texts only and this is never read, so a number
   * typed here would look set and ring nothing — the exact fault the settings
   * screen had.
   */
  const studio = connection.studios as unknown as { channels_allowed: string[] | null } | null;
  if (!takesCalls(studio?.channels_allowed)) {
    return { error: "Voice is off for this account, so a call rings nowhere. Turn it on first." };
  }

  const read = readNumbers(connection.external_id ?? "", String(fd.get("forward_to") ?? ""));
  if (!read.ok) return { error: read.error };

  const stamped = (await hasColumn(db, "channel_connections", "updated_at"))
    ? { updated_at: new Date().toISOString() }
    : {};

  const { data: written, error } = await db
    .from("channel_connections")
    .update({ forward_to: read.forwardTo, ...stamped })
    .eq("id", connectionId)
    .select("id");

  if (error) return { error: error.message };
  if (!written?.length) return { error: "That could not be changed. Try again." };

  revalidatePath("/admin");
  return { ok: true };
}

/**
 * One line off, or back on, without touching the others.
 *
 * The number box on the account panel holds one number, and clearing it used
 * to switch off every sms line the business had. Right when a business could
 * only have one; wrong the moment you can give one to a stylist, because the
 * box shows the salon's and clearing it took hers away too.
 *
 * Off rather than deleted, for the reason the supply record exists at all: a
 * number switched off here has not been handed back to Twilio and is still on
 * the bill. Forgetting it happened is how a rental runs for a year with nobody
 * able to say what it is for.
 */
export async function switchLine(_prev: Result, fd: FormData): Promise<Result> {
  const denied = await guard();
  if (denied) return denied;

  const connectionId = String(fd.get("connection") ?? "");
  if (!connectionId) return { error: "No number." };

  const on = String(fd.get("on") ?? "") === "1";

  const db = createAdminClient();

  const stamped = (await hasColumn(db, "channel_connections", "updated_at"))
    ? { updated_at: new Date().toISOString() }
    : {};

  const { data: written, error } = await db
    .from("channel_connections")
    .update({ active: on, ...stamped })
    .eq("id", connectionId)
    .select("id");

  if (error) return { error: error.message };
  if (!written?.length) return { error: "That number is no longer there." };

  revalidatePath("/admin");
  return { ok: true };
}

export async function fixChannel(_prev: Result, fd: FormData): Promise<Result> {
  const denied = await guard();
  if (denied) return denied;

  const id = String(fd.get("id") ?? "");
  if (!id) return { error: "No business." };

  const db = createAdminClient();

  const read = readNumbers(
    String(fd.get("sms_number") ?? ""),
    String(fd.get("forward_to") ?? ""),
  );
  if (!read.ok) return { error: read.error };
  const { number, forwardTo } = read;

  /*
   * The box that says "add" can only ever add.
   *
   * The screen sends mode=add, because the one form there is now an empty box
   * headed "Add another number" rather than a filled one headed "their
   * number". An empty box submitted by accident used to mean "switch every
   * number this business has off" — which is a reasonable reading of clearing
   * a field that showed a number, and an unreasonable one of leaving an add
   * box untouched. Same submission, opposite meanings, so the form says which
   * it meant rather than leaving it to be inferred.
   *
   * Switching a line off has its own switch on its own row, and taking one
   * away for good is a Twilio job first.
   */
  const adding = String(fd.get("mode") ?? "") === "add";

  if (adding && !number) {
    return { error: "Type the number to add. To switch one off, use the switch on its row." };
  }

  if (adding && number) {
    const { data: mine } = await db
      .from("channel_connections")
      .select("id")
      .eq("studio_id", id)
      .eq("channel", "sms")
      .eq("external_id", number)
      .limit(1)
      .maybeSingle();

    if (mine) {
      return { error: "They already have that number. Its own row below is where it is changed." };
    }
  }

  /*
   * Clearing it switches the line off rather than forgetting it happened.
   *
   * This deleted the row, which took the only record of the number with it.
   * Two things went: the assistant stops using it either way, which is the
   * point, but we also stopped knowing we had ever supplied it — and a number
   * switched off in here has not been handed back to Twilio, so the rental is
   * still on the bill.
   *
   * Giles asked for a record of what he supplies, turned on and off. This is
   * the off, and a deleted row cannot be it.
   */
  if (!number) {
    /*
     * And only where there is one line to switch off.
     *
     * This box holds one number and this branch switched off every sms line
     * the business had. That was right when a business could only have one. It
     * is now the way to take a stylist's number away by clearing the box that
     * shows the salon's, which is not a thing anybody would mean to do, and
     * there is no undo: a number switched off here is still rented from Twilio
     * and still on the bill.
     *
     * Each line has its own switch on its own row now, which is the honest
     * place for it. This refuses rather than guessing which one was meant.
     */
    const { data: lines } = await db
      .from("channel_connections")
      .select("id")
      .eq("studio_id", id)
      .eq("channel", "sms")
      .eq("active", true);

    if ((lines ?? []).length > 1) {
      return {
        error: `This business has ${lines?.length} numbers, so clearing this box cannot say which one you mean. Use the switch on the number's own row below.`,
      };
    }

    const { error } = await db
      .from("channel_connections")
      .update({ active: false })
      .eq("studio_id", id)
      .eq("channel", "sms");
    if (error) return { error: error.message };
    revalidatePath("/admin");
    return { ok: true };
  }

  /*
   * A number routes an incoming text to exactly one business, so two of them
   * holding the same one is not a preference. Checked here as well as on their
   * own page, because this screen can see every business and is therefore the
   * one place the mistake is easy to make.
   */
  const { data: taken } = await db
    .from("channel_connections")
    .select("studio_id, studios(name)")
    .eq("channel", "sms")
    .eq("external_id", number)
    .limit(1)
    .maybeSingle();

  if (taken && taken.studio_id !== id) {
    const who = (taken as { studios?: { name?: string } | null }).studios?.name;
    return { error: `That number already belongs to ${who ?? "another business"}.` };
  }

  /*
   * This number, not whatever number they had.
   *
   * It looked up the business's one sms row and overwrote it, which is right
   * for a business with one line and wrong the moment there are two: giving a
   * salon a second number silently replaced the first, and the first is the
   * one on their van.
   *
   * A business is supplied as many as it has paid for, and each one is then
   * given to somebody or kept as the business's. So a number already on this
   * business is edited, and one that is not is added beside the others.
   */
  const { data: existing } = await db
    .from("channel_connections")
    .select("id")
    .eq("studio_id", id)
    .eq("channel", "sms")
    .eq("external_id", number)
    .limit(1)
    .maybeSingle();

  /*
   * Stamped only once the column is there. Writing it before the migration
   * runs would not lose the stamp — PostgREST would reject the whole save, and
   * the number would not go in at all.
   */
  const stamped = (await hasColumn(db, "channel_connections", "updated_at"))
    ? { updated_at: new Date().toISOString() }
    : {};

  const { error } = existing
    ? await db
        .from("channel_connections")
        .update({
          external_id: number,
          label: number,
          active: true,
          forward_to: forwardTo,
          ...stamped,
        })
        .eq("id", existing.id)
    : await db.from("channel_connections").insert({
        studio_id: id,
        channel: "sms",
        external_id: number,
        label: number,
        active: true,
        forward_to: forwardTo,
        ...stamped,
      });

  if (error) return { error: error.message };

  revalidatePath("/admin");
  return { ok: true };
}

/**
 * Marking the early-access list as written to.
 *
 * `told_at` has been on the table since it was created, for exactly one
 * purpose — so a launch email does not arrive twice — and nothing has ever
 * been able to set it, because nothing has ever been able to read the list
 * either. A form on the marketing site has been quietly collecting real
 * people's addresses into a table with no screen behind it.
 *
 * Set after the writing, never instead of it. Nothing here sends a launch
 * email: that is a decision about wording and timing, not a button. So this
 * says "I have written to them" and is pressed by somebody who has, which is
 * honest about which half is automatic.
 */
export async function markTold(_prev: Result, fd: FormData): Promise<Result> {
  const stop = await guard();
  if (stop) return stop;

  const product = String(fd.get("product") ?? "").trim();
  if (!product) return { error: "Which product?" };

  const db = createAdminClient();

  /*
   * Only the ones on the list as it was read. Somebody who signs up between
   * the page rendering and the button being pressed has not been written to,
   * and marking them told would lose them permanently and silently — which is
   * the one failure this column exists to prevent, arriving by another door.
   */
  const ids = String(fd.get("ids") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  if (ids.length === 0) return { error: "Nobody to mark." };

  const { error } = await db
    .from("product_interest")
    .update({ told_at: new Date().toISOString() })
    .in("id", ids)
    .is("told_at", null);

  if (error) return { error: error.message };

  revalidatePath("/admin");
  return { ok: true, note: `${ids.length} marked as written to.` };
}

/**
 * Switching marketing on for a business, per channel.
 *
 * Giles: an option for email and text marketing, with the ability to turn it
 * on and off for all in the back end, so it can be charged for — text
 * marketing especially, because it costs per message.
 *
 * Ours to set rather than the business's, which is why it is here and not on
 * a settings screen. A business can already decide who it writes to and what
 * it says; this decides whether it is buying the feature at all. Same
 * reasoning as the Stripe Connect key having no box in the app.
 *
 * Switching this on gives nobody permission to write to anybody. Consent is a
 * separate and stricter test on each person, and mayMarket() requires both —
 * see marketingPlan.ts, which is deliberately the only way to ask.
 *
 * Guarded by hasColumn so it says something useful before the migration runs
 * rather than failing with a column name.
 */
export async function setMarketing(_prev: Result, fd: FormData): Promise<Result> {
  const denied = await guard();
  if (denied) return denied;

  const id = String(fd.get("id") ?? "");
  const channel = String(fd.get("channel") ?? "");
  const on = String(fd.get("on") ?? "") === "1";

  if (!id) return { error: "No business." };
  if (channel !== "email" && channel !== "sms") return { error: "Unknown channel." };

  const column = channel === "email" ? "marketing_email_on" : "marketing_sms_on";

  const db = createAdminClient();

  if (!(await hasColumn(db, "studios", column))) {
    return {
      error:
        "Marketing is not switched on in the database yet — run " +
        "20260923090000_marketing_entitlement.sql first.",
    };
  }

  const { error } = await db.from("studios").update({ [column]: on }).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin");
  return {
    ok: true,
    note: on
      ? `${channel === "email" ? "Email" : "Text"} marketing is on. They still only reach people who have opted in.`
      : `${channel === "email" ? "Email" : "Text"} marketing is off.`,
  };
}
