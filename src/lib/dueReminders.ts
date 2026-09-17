/**
 * Getting in before the DVSA does.
 *
 * The government texts every motorist one month before their MOT runs out,
 * free, and that text is useless to them: it tells somebody a date and leaves
 * them to find a garage. A garage's own reminder is worth nothing if it arrives
 * after that one and says the same thing — so it goes earlier, and it carries a
 * slot. Same for a theory pass eighteen months old, a service, an exam.
 *
 * This is the half of trade fields that makes money. The other half stops a
 * booking; this one starts one.
 *
 * Pure, and alone in its file, because the wording that goes to somebody's
 * phone should be readable without reading a database client. See tradeFacts
 * for what a fact is and dueSoon for which ones are ripe.
 */

import type { TradeFact } from "./tradeFacts";

/** How a date is said to a person, rather than to a column. */
export function sayDate(iso: string): string {
  const when = new Date(`${iso}T09:00:00Z`);
  if (!Number.isFinite(when.getTime())) return iso;
  return when.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

/**
 * The reminder itself.
 *
 * First name only, because that is how a garage talks. The business is named
 * because an unsigned text about a vehicle reads like a scam — and half the
 * scams people get are exactly this text. The opt-out is on every one, because
 * this is marketing under PECR however useful it is: an existing customer, a
 * similar service, a way out in every message.
 */
export function dueMessage(
  fact: TradeFact,
  on: string,
  who: { name?: string | null; business: string },
  now: Date = new Date(),
): string {
  const first = (who.name ?? "").trim().split(/\s+/)[0] ?? "";
  const hello = first ? `Hi ${first} — ` : "";

  const what = fact.remindText
    ? fact.remindText.replace("{date}", sayDate(on))
    : `your ${fact.label.toLowerCase()} is due on ${sayDate(on)}`;

  /*
   * "Before then" is only true of a date still ahead.
   *
   * A couple of these count backwards from something that already happened —
   * a boiler serviced eleven months ago is due another one — and telling
   * somebody to book in before a date last November reads as a mistake, which
   * is all it takes for the text to be ignored.
   */
  const ahead = on >= now.toISOString().slice(0, 10);
  const offer = ahead ? "want me to book you in before then?" : "want me to book you in?";

  return `${hello}${what}. ${who.business} here — ${offer} Reply STOP to opt out.`;
}

/**
 * What a reminder is claimed under, so nobody is texted twice about one date.
 *
 * The date is in the key on purpose. Next year's MOT is a different reminder
 * about the same car and the same field, and a key without the date would
 * silently swallow it — the customer would hear from us once, ever.
 */
export function dueKey(contactId: string, fact: TradeFact, on: string): string {
  return `due:${contactId}:${fact.key}:${on}`;
}
