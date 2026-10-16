import type { SupabaseClient } from "@supabase/supabase-js";
import type { Studio } from "@/lib/types";
import { localParts } from "@/lib/booking/tz";
import { dailyBrief, type BriefBooking } from "@/lib/dailyBrief";
import { dailyBriefHtml } from "@/lib/dailyBriefEmail";
import { sendEmail } from "@/lib/messaging/email";
import { hasColumn } from "@/lib/db/hasColumn";

/**
 * This morning's diary, to whoever asked for it.
 *
 * Giles, 15 October: "a daily brief that clients can switch on or off, sent
 * to the primary person, so individual workers if they are set up separate or
 * the owner if not."
 *
 * So two kinds of recipient. The owners get the whole business's day, because
 * that is the picture they are being asked whether they have seen. Anybody on
 * the team with their own email address gets their own day and nothing else,
 * because a stylist does not need the other two chairs and a dog walker does
 * not need the groomer's. Where those are the same address, which is most
 * one-person businesses, the owner's copy is the only one sent.
 *
 * Rides on the sweep, exactly as the weekly report does, and claims the day
 * on the business's row before sending anything. Two sweeps a minute apart
 * both try to claim; one wins, and only that one sends. That matters more
 * here than anywhere else in the product, because the sweep's real gaps are
 * hours and the claim is the only thing standing between somebody and the
 * same email four times.
 */

/** Not before this hour, in the business's own time. */
const FROM_HOUR = 7;

export async function sendDailyBriefs(
  db: SupabaseClient,
  studios: Studio[],
  now: Date = new Date(),
): Promise<{ sent: number; failed: string[] }> {
  let sent = 0;
  const failed: string[] = [];

  /*
   * Nothing at all until the migration has been run.
   *
   * Asked once for the whole sweep rather than per business: the answer
   * cannot differ between them, and a no is re-asked a minute later anyway.
   */
  if (!(await hasColumn(db, "studios", "daily_brief_email"))) return { sent, failed };

  for (const studio of studios) {
    const row = studio as Studio & {
      daily_brief_email?: boolean;
      daily_brief_sent_on?: string | null;
    };
    if (!row.daily_brief_email || studio.archived_at || studio.kind === "demo") continue;

    const tz = studio.timezone ?? "Europe/London";
    const { year, month, day } = localParts(now, tz);
    const hour =
      Number(
        new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hour12: false }).format(
          now,
        ),
      ) % 24;
    if (hour < FROM_HOUR) continue;

    const today = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (row.daily_brief_sent_on === today) continue;

    const { data: claimed } = await db
      .from("studios")
      .update({ daily_brief_sent_on: today })
      .eq("id", studio.id)
      .or(`daily_brief_sent_on.is.null,daily_brief_sent_on.neq.${today}`)
      .select("id");
    if (!claimed?.length) continue;

    try {
      sent += await briefOneBusiness(db, studio, today, tz, failed);
    } catch (e) {
      failed.push(`${studio.name}: ${(e as Error).message}`);
    }
  }

  return { sent, failed };
}

/**
 * Midnight where the business is, as an instant.
 *
 * Worked out by asking what the clock there says at midday UTC rather than
 * by arithmetic on a fixed offset. A day is not always 24 hours long: on the
 * last Sunday in October it is 25, and a brief built on "plus 24 hours" drops
 * an hour of appointments on exactly the morning everybody is already
 * confused about the time.
 */
function midnightAt(date: string, timeZone: string): number {
  const shown = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    hour12: false,
  }).format(new Date(`${date}T12:00:00Z`));
  const offsetHours = 12 - (Number(shown) % 24);
  return Date.parse(`${date}T00:00:00Z`) + offsetHours * 3600_000;
}

/** The day, from its own midnight to the next one. */
function dayEdges(today: string, timeZone: string): { from: string; to: string } {
  const tomorrow = new Date(Date.parse(`${today}T12:00:00Z`) + 86_400_000)
    .toISOString()
    .slice(0, 10);
  return {
    from: new Date(midnightAt(today, timeZone)).toISOString(),
    to: new Date(midnightAt(tomorrow, timeZone)).toISOString(),
  };
}

async function briefOneBusiness(
  db: SupabaseClient,
  studio: Studio,
  today: string,
  tz: string,
  failed: string[],
): Promise<number> {
  const { data: team } = await db
    .from("artists")
    .select("id, name, email")
    .eq("studio_id", studio.id)
    .eq("active", true);

  const people = (team ?? []) as { id: string; name: string | null; email: string | null }[];
  if (!people.length) return 0;

  const { from, to } = dayEdges(today, tz);

  /*
   * Everything in the day, including what was typed in by hand and what has
   * no customer attached. "Including everything" was the request, and a brief
   * that quietly left out the block of time somebody put in to keep a morning
   * free would be worse than none.
   */
  const { data: rows, error } = await db
    .from("bookings")
    .select(
      "starts_at, ends_at, all_day, title, notes, price_pence, category, artist_id, " +
        "deposit_amount_pence, deposit_status, contacts(name, phone)",
    )
    .in("artist_id", people.map((p) => p.id))
    .is("cancelled_at", null)
    .gte("starts_at", from)
    .lt("starts_at", to)
    .order("starts_at");

  if (error) throw new Error(`could not read the day: ${error.message}`);

  const nameOf = new Map(people.map((p) => [p.id, p.name]));
  const all: (BriefBooking & { artist_id: string })[] = (rows ?? []).map((r) => {
    const b = r as unknown as Record<string, unknown>;
    const contact = b.contacts as { name?: string | null; phone?: string | null } | null;
    return {
      artist_id: b.artist_id as string,
      starts_at: b.starts_at as string,
      ends_at: b.ends_at as string,
      all_day: (b.all_day as boolean | null) ?? false,
      title: (b.title as string | null) ?? null,
      notes: (b.notes as string | null) ?? null,
      price_pence: (b.price_pence as number | null) ?? null,
      category: (b.category as string | null) ?? null,
      who: nameOf.get(b.artist_id as string) ?? null,
      client: contact?.name ?? null,
      phone: contact?.phone ?? null,
      deposit_amount_pence: (b.deposit_amount_pence as number | null) ?? 0,
      deposit_status: (b.deposit_status as string | null) ?? null,
    };
  });

  /* The owners, who get the lot. */
  const { data: owners } = await db
    .from("studio_members")
    .select("user_id")
    .eq("studio_id", studio.id)
    .eq("role", "owner");

  const ownerEmails: string[] = [];
  for (const o of owners ?? []) {
    const { data } = await db.auth.admin.getUserById(o.user_id as string);
    if (data.user?.email) ownerEmails.push(data.user.email.toLowerCase());
  }

  let sent = 0;
  const anchor = all[0]?.starts_at ?? `${today}T12:00:00Z`;

  for (const owner of new Set(ownerEmails)) {
    const about = {
      day: anchor,
      timeZone: tz,
      business: studio.name,
      manyPeople: people.length > 1,
    };
    /*
     * Both halves, from the same rows and the same options object.
     *
     * The shared builder has a plain-text renderer that nothing uses, so
     * every other email in the product hand-writes its text part separately
     * and the two can drift. Building both from one `about` here is the
     * cheapest way of making sure the diary and the words agree.
     */
    sent += await post(owner, dailyBrief(all, about), studio, failed, dailyBriefHtml(all, about));
  }

  /*
   * And each person with their own address, with their own day in it.
   *
   * Skipped where it is an owner's address: they have just been sent
   * everything, and a second email covering part of it would read as a fault.
   */
  for (const person of people) {
    const address = person.email?.trim().toLowerCase();
    if (!address || ownerEmails.includes(address)) continue;

    const theirs = all.filter((b) => b.artist_id === person.id);
    const mine = {
      day: theirs[0]?.starts_at ?? anchor,
      timeZone: tz,
      business: studio.name,
      forWhom: person.name?.split(" ")[0] ?? null,
      /* Their own day is all theirs, so there is no point naming them on it. */
      manyPeople: false,
    };
    sent += await post(
      address,
      dailyBrief(theirs, mine),
      studio,
      failed,
      dailyBriefHtml(theirs, mine),
    );
  }

  return sent;
}

async function post(
  to: string,
  brief: { subject: string; text: string },
  studio: Studio,
  failed: string[],
  /** The diary, drawn. The text above is sent with it, never instead of it. */
  html?: string,
): Promise<number> {
  const result = await sendEmail({
    to,
    subject: brief.subject,
    text: brief.text,
    html,
    fromName: studio.name,
  });
  if (result.status === "failed") {
    failed.push(`${studio.name}: ${result.error ?? "the brief did not send"}`);
    return 0;
  }
  return 1;
}
