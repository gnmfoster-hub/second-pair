/**
 * Asking for a review, once, the morning after.
 *
 * A whole category of competitor exists on this alone — Podium, Birdeye, Weave
 * are reputation products first and everything else second. It is one message
 * after a job that went well, and it is the cheapest marketing a small business
 * has: the trades we sell to live or die on a Google rating that a customer
 * only leaves if somebody asks.
 *
 * Deliberately the morning after rather than minutes later. Somebody walking
 * out of a salon with wet hair, or standing in a hallway while the electrician
 * packs up, has not formed a view yet — and a phone buzzing in their pocket
 * while the person who did the work is still in the room is an ambush, not a
 * request.
 *
 * Pure, and alone in its file, so the rules about who gets asked can be
 * checked without a database.
 */

export type Finished = {
  id: string;
  /** When the appointment ended. */
  ends_at: string;
  cancelled_at: string | null;
  /** Null for a slot somebody typed in with no customer attached. */
  contact_id: string | null;
  /** Blocks, holidays and lunch breaks are not appointments. */
  source?: string | null;
};

/**
 * Which of yesterday's appointments are worth asking about.
 *
 * Everything here is a reason somebody should not be asked, and each one is a
 * way of getting this wrong that would embarrass the business:
 *
 *  - a cancelled appointment never happened
 *  - a block, a holiday or a lunch break has no customer in it
 *  - an appointment with nobody attached has nowhere to send it
 *  - anything still in the future has not happened yet, which sounds obvious
 *    until a booking is moved and the sweep runs again
 *
 * One per appointment, not one per customer per day: somebody who had two
 * things done is asked once, because the second message reads as nagging and
 * the first one already asked.
 */
export function worthAsking(
  finished: Finished[],
  now: Date = new Date(),
): Finished[] {
  const seen = new Set<string>();
  const out: Finished[] = [];

  for (const booking of finished) {
    if (booking.cancelled_at) continue;
    if (!booking.contact_id) continue;
    if (booking.source === "block") continue;

    const ended = Date.parse(booking.ends_at);
    if (!Number.isFinite(ended) || ended > now.getTime()) continue;

    if (seen.has(booking.contact_id)) continue;
    seen.add(booking.contact_id);
    out.push(booking);
  }

  return out;
}

/**
 * What it says.
 *
 * Short, because it is a favour being asked. Names the business so it does not
 * read as a stranger, names what they had done only if we know it, and puts the
 * link at the end where a thumb lands. No "we'd love five stars" — a business
 * that asks for a specific rating is asking for a review it has not earned, and
 * on Google it is against the rules.
 */
export function reviewMessage(args: {
  firstName?: string | null;
  business: string;
  what?: string | null;
  url: string;
  /**
   * The business's own wording, if they have written one.
   *
   * Null means they never opened the screen, and they get the sentence below.
   * An empty string means they cleared it, which is a different thing and is
   * respected rather than silently overwritten — putting our words back in
   * somebody's mouth because they deleted them is worse than sending nothing.
   *
   * The same placeholders as a reminder, so there is one thing to learn.
   */
  template?: string | null;
}): string {
  const hello = args.firstName?.trim() ? `Hi ${args.firstName.trim()}` : "Hi";
  const about = args.what?.trim() ? ` with your ${args.what.trim().toLowerCase()}` : "";

  if (args.template != null) {
    return fillReview(args.template, args);
  }

  return (
    `${hello} — hope everything went well${about} yesterday. ` +
    `If you have a minute, a quick review really helps ${args.business}: ${args.url}`
  );
}

/** The placeholders a review request may use. Deliberately the reminder set plus the link. */
export const REVIEW_TOKENS = ["name", "business", "what", "link"] as const;

/**
 * Fills a business's own wording.
 *
 * An unknown placeholder is taken out rather than left in, which is what
 * renderReminder does — a customer seeing {{frist_name}} is worse than a
 * customer seeing a gap, and the editor warns about it before it is saved.
 */
export function fillReview(
  template: string,
  args: { firstName?: string | null; business: string; what?: string | null; url: string },
): string {
  return template
    .replace(/\{\{\s*name\s*\}\}/gi, args.firstName?.trim() ?? "")
    .replace(/\{\{\s*business\s*\}\}/gi, args.business)
    .replace(/\{\{\s*what\s*\}\}/gi, args.what?.trim()?.toLowerCase() ?? "")
    .replace(/\{\{\s*link\s*\}\}/gi, args.url)
    .replace(/\{\{[^}]*\}\}/g, "")
    .replace(/[ 	]{2,}/g, " ")
    .trim();
}

/** The day either side of "yesterday", in the business's own time. */
export function yesterdayIn(timezone: string, now: Date = new Date()): { from: string; to: string } {
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const today = day.format(now);
  const yesterday = day.format(new Date(now.getTime() - 86_400_000));

  /*
   * Read as instants at the edges of the day rather than as local midnights,
   * which is near enough for a sweep that runs each morning and avoids a
   * timezone conversion that would be wrong twice a year.
   */
  return { from: `${yesterday}T00:00:00.000Z`, to: `${today}T00:00:00.000Z` };
}
