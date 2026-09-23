/**
 * Whether a business is allowed to run campaigns at all, and to whom.
 *
 * Two different questions live near each other here and the whole point of
 * this file is that they never get confused:
 *
 *   The business bought it. Switched on by us in the back office, per channel,
 *   because texts cost money per message and email costs almost nothing. This
 *   is what Giles charges for.
 *
 *   The person agreed to it. contacts.marketing_email / marketing_sms, with
 *   the dated evidence PECR asks for. Nothing we switch on gives anybody
 *   permission to write to somebody who has not opted in.
 *
 * Both must be true before a single campaign message goes anywhere. Written
 * down as one function so there is no route to sending that checks one and
 * forgets the other — which is the mistake that ends with a business fined for
 * something the software let it do.
 *
 * Reminders and confirmations are not marketing and never come through here.
 * They are service messages about an appointment somebody booked.
 *
 * Pure, so the awkward combinations can be tested without a database.
 */

/** Only the parts of a business these rules read. */
export type MarketingBusiness = {
  /**
   * Undefined until the migration runs, which must read as off.
   *
   * A deploy can land before its migration, and an entitlement that defaults
   * to on for twenty minutes is a business sending campaigns it has not paid
   * for to people who may not have agreed. Off is the only safe absence.
   */
  marketing_email_on?: boolean | null;
  marketing_sms_on?: boolean | null;
  archived_at?: string | null;
};

/** Only the parts of a person these rules read. */
export type MarketingPerson = {
  email?: string | null;
  phone?: string | null;
  marketing_email?: boolean | null;
  marketing_sms?: boolean | null;
};

export type Channel = "email" | "sms";

/** Whether we have switched this channel on for this business. */
export function businessMay(studio: MarketingBusiness, channel: Channel): boolean {
  /* A stopped business does not market to anybody, whatever it has bought. */
  if (studio.archived_at) return false;
  return channel === "email"
    ? studio.marketing_email_on === true
    : studio.marketing_sms_on === true;
}

/** Whether this person has agreed, and can actually be reached that way. */
export function personMay(person: MarketingPerson, channel: Channel): boolean {
  return channel === "email"
    ? person.marketing_email === true && Boolean(person.email)
    : person.marketing_sms === true && Boolean(person.phone);
}

/**
 * The only question a sender should ask.
 *
 * Both halves, in one place, so no route to sending can check one and forget
 * the other.
 */
export function mayMarket(
  studio: MarketingBusiness,
  person: MarketingPerson,
  channel: Channel,
): boolean {
  return businessMay(studio, channel) && personMay(person, channel);
}

/** Which channels this business has bought, for the screen to describe. */
export function channelsOn(studio: MarketingBusiness): Channel[] {
  const on: Channel[] = [];
  if (businessMay(studio, "email")) on.push("email");
  if (businessMay(studio, "sms")) on.push("sms");
  return on;
}

/**
 * How many of these people could lawfully be sent a campaign on this channel.
 *
 * The number the screen must show beside a send button, because "send to
 * everybody who had a colour" and "send to everybody who had a colour and
 * agreed to hear from you" are very different numbers, and the second one is
 * the only one that may be sent.
 */
export function reachable(
  studio: MarketingBusiness,
  people: MarketingPerson[],
  channel: Channel,
): number {
  if (!businessMay(studio, channel)) return 0;
  return people.filter((p) => personMay(p, channel)).length;
}
