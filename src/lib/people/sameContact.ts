/**
 * The same person, arriving a second way.
 *
 * Giles, 22 October, about Jess at Living Canvas: "she had a booking and
 * contacted to change it, as far as I can see this wasn't an easy process for
 * her and she at times got treated like a new customer."
 *
 * She did, and this file is the first half of why. Jess chatted on the
 * website at 10:38, booked a Saturday, and at 10:42 replied to her own
 * confirmation email asking to cancel. That reply made a brand new contact
 * row: same name, same address, four minutes apart. From that moment the
 * business had two Jesses and the assistant answering the email knew nothing
 * about the one who had just booked.
 *
 * It was not her. The same shape is on the client list of every live
 * business on the platform:
 *
 *   Living Canvas    Jess          web, then email
 *   Neat & Tidy      Samantha      web, then email
 *   Amber's          Julie Koch    web, then email, and the second row lost
 *                                  her surname
 *
 * Three out of three, because a conversation always made a contact and never
 * once looked to see whether it already had one. There was a guard for the
 * phone, but only as a rescue after the unique index refused the insert, so
 * it fired for numbers and never for addresses — and the website collects
 * addresses.
 *
 *
 * Why the matching is pure and the query is broad
 * ----------------------------------------------
 *
 * A number is written five ways by the five people who write it down, and
 * none of them is wrong: 07780 575834, +447780575834, 447780575834. Asking
 * the database for an exact string finds one of the five. So the query casts
 * wide — the last six digits, which any spelling of a number ends with — and
 * the decision is made here, in a function with no database in it, by the
 * same samePhone the rest of the product already trusts.
 *
 * Matching too eagerly merges two people who are not the same person, which
 * is far worse than the duplicate it is trying to avoid: one customer would
 * read another's appointments. So the rules are narrow and they are all here
 * to be read.
 */

/* Relative, with the extension: the tests load this file in node directly. */
import { samePhone } from "../channels/phoneNumbers.ts";

export type Candidate = {
  id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  is_test?: boolean | null;
  created_at?: string | null;
};

/** An address, as two spellings of it that should match. */
export function sameEmail(raw: string | null | undefined): string {
  const one = String(raw ?? "").trim().toLowerCase();
  /*
   * Case and whitespace only. Not the dots-and-plus-signs trick Gmail allows:
   * it is true for Gmail and false for most other hosts, and a rule that is
   * right for one provider merges strangers everywhere else.
   */
  return one.includes("@") ? one : "";
}

/**
 * Which of these rows is the person who just wrote in, or none of them.
 *
 * @param rows candidates already narrowed by the database, same business
 * @param known what the channel proves about them: the address or the number
 *   the message arrived from
 * @param isTest whether this arrival is a rehearsal, which never joins a real
 *   person and a real person never joins
 */
export function matchContact(
  rows: Candidate[],
  known: { email?: string; phone?: string },
  isTest = false,
): Candidate | null {
  const email = sameEmail(known.email);
  const phone = samePhone(known.phone);
  if (!email && !phone) return null;

  const fits = rows.filter((row) => {
    if (Boolean(row.is_test) !== Boolean(isTest)) return false;
    if (email && sameEmail(row.email) === email) return true;
    if (phone && samePhone(row.phone) === phone) return true;
    return false;
  });

  if (!fits.length) return null;

  /*
   * The oldest, and among equals the one with the most on it.
   *
   * Oldest because that is the record the business has been adding to: their
   * notes are on it, their bookings point at it, and the client list is
   * sorted by it. The newer row is the accident.
   *
   * "Most on it" only breaks a tie, and counts the fields a person would
   * recognise them by rather than every column, because a row with a name and
   * a number is more use to whoever opens it than one with a name and a
   * marketing flag.
   */
  const weight = (row: Candidate) =>
    (row.name?.trim() ? 1 : 0) + (row.email?.trim() ? 1 : 0) + (row.phone?.trim() ? 1 : 0);

  return [...fits].sort((a, b) => {
    const age = String(a.created_at ?? "").localeCompare(String(b.created_at ?? ""));
    return age !== 0 ? age : weight(b) - weight(a);
  })[0];
}

/**
 * What to put on the row we are joining, having learned something new.
 *
 * Only gaps. A contact that has a name keeps the name it has: the one on the
 * record was typed by the business or given deliberately, and the one on an
 * inbound message is whatever the mail client happened to put in a From line.
 * Returns an empty object where there is nothing to add, so the caller can
 * skip the write entirely.
 */
export function fillGaps(
  row: Candidate,
  known: { email?: string; phone?: string },
): Record<string, string> {
  const patch: Record<string, string> = {};
  if (known.email && !row.email?.trim()) patch.email = sameEmail(known.email);
  if (known.phone && !row.phone?.trim()) patch.phone = known.phone;
  return patch;
}

/**
 * The tail of a number, for asking the database a wide question.
 *
 * Six digits rather than the lot, because that is the part every spelling has
 * in common and the part no spacing breaks up. It is a sieve and not a
 * decision: whatever comes back is put through matchContact above.
 */
export function phoneTail(raw: string | null | undefined): string {
  const digits = String(raw ?? "").replace(/\D/g, "");
  return digits.length >= 6 ? digits.slice(-6) : "";
}
