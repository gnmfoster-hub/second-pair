/**
 * Whether there is enough of somebody to book them in.
 *
 * A booking exists so that two people meet. If the diary says nine o'clock
 * Thursday and nothing else, the business cannot ring to confirm it, cannot
 * chase a no-show, and cannot tell one Thursday customer from another — it is
 * an hour of somebody's working day given to a stranger.
 *
 * The assistant was already told to collect this before booking, in the
 * description of the booking tool, and mostly does. Mostly is the problem: in
 * one live walk-through the customer typed their name and mobile number, the
 * assistant said "got it", and then booked without recording either. Advice in
 * a prompt is not a rule, and this is a rule.
 */

export type Contact = {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
};

const has = (v: string | null | undefined) => Boolean(v && v.trim());

/**
 * What is missing, in words meant for the assistant, or null if nothing is.
 *
 * Deliberately not a boolean: the caller has to say something useful to the
 * customer, and "we need a phone number" and "we never caught your name" are
 * different sentences.
 */
export function missingDetails(contact: Contact | null | undefined): string | null {
  const name = has(contact?.name);
  const reach = has(contact?.phone) || has(contact?.email);
  if (name && reach) return null;
  if (!name && !reach) return "their name and a phone number or email address";
  if (!name) return "their name";
  return "a phone number or email address";
}
