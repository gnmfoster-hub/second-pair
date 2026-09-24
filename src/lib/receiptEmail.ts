/**
 * Taking an email address at the till, to send a receipt to.
 *
 * Giles: "should have option to add email at complete to send receipt as this
 * will help to get email address which is cheaper for the system."
 *
 * Both halves are true and the second is the reason to build it. A receipt is
 * the one moment somebody actively wants us to have their address — they have
 * just paid and they are standing there — and every address collected turns a
 * client's future reminders from texts that cost money into emails that cost
 * nothing.
 *
 * The rules live here rather than in the action because they are the part that
 * can quietly do harm: asking somebody who already has an address, or writing
 * a hurried typo over the address their reminders have been going to for three
 * years. Pure, so both can be tested without a database.
 */

/**
 * Whether to ask at all.
 *
 * Only where money changed hands with a client we hold nothing for. A walk-in
 * with no record is nobody to save an address against, and somebody who
 * already has one has already had their receipt.
 */
export function shouldAsk(input: {
  contactId?: string | null;
  email?: string | null;
  tookMoney: boolean;
}): boolean {
  if (!input.tookMoney) return false;
  if (!input.contactId) return false;
  return !(input.email ?? "").trim();
}

/**
 * Shaped like an address.
 *
 * Deliberately loose. This is not trying to decide whether an address exists —
 * only the server that owns it can say that — it is catching the three things
 * somebody types at a counter in a hurry: a name with no @, a missing dot, and
 * a stray space in the middle.
 */
export function looksLikeEmail(value: string): boolean {
  return /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(value.trim());
}

export type TakeResult = { ok: true; email: string } | { ok: false; because: string };

/**
 * Whether this address may be written to that record.
 *
 * Never an overwrite. The person at the counter is reading an address out
 * loud, at speed, to somebody holding a card machine — and a typo landing on
 * top of a good address would take every future reminder with it, silently,
 * for as long as it took anybody to notice.
 *
 * So a record that already has one is refused rather than replaced. Changing
 * an address is a thing you do on the client's page, looking at it.
 */
export function mayTake(typed: string, existing: string | null | undefined): TakeResult {
  const email = typed.trim().toLowerCase();

  if (!email) return { ok: false, because: "Nothing typed." };
  if (!looksLikeEmail(email)) {
    return { ok: false, because: "That does not look like an email address." };
  }
  if ((existing ?? "").trim()) {
    return { ok: false, because: "They already have an address on their record." };
  }

  return { ok: true, email };
}
