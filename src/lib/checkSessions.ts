/**
 * Session keys the checks in scripts/ use for themselves.
 *
 * They exist so a run can clear up after itself: every check writes real
 * enquiries to a demo and deletes them afterwards by prefix. See
 * scripts/_tidy.mjs, which is where they were only ever written down.
 *
 * Now the server needs to know them too, for one thing: whether a model turn
 * goes on the bill as a customer or as us. Every check talks to the ordinary
 * widget endpoint, so without this its spend is recorded as a customer's, and
 * the whole point of the durable spend record is being able to tell those
 * apart. Giles's Anthropic credit was going on testing and no figure anywhere
 * said so.
 *
 * Only ever used to label what is already being paid for. Nothing is permitted
 * or refused on the strength of it, so a customer whose random session happens
 * to start with "book" loses nothing at all: one conversation is filed under
 * testing on a cost report.
 */
export const CHECK_PREFIXES = [
  "speed",
  "strm",
  "inpg",
  "curl",
  "long",
  "hdr",
  "book",
  "regular-test",
  /*
   * The ones written this week. They were passing their prefix to tidyUp by
   * hand, so they cleaned up properly and were still missing from the shared
   * list, which is the list this file was made from.
   */
  "answ",
  "awkw",
  "sale",
];

export function isCheckSession(sessionKey: string | null | undefined): boolean {
  const key = (sessionKey ?? "").trim();
  return key.length > 0 && CHECK_PREFIXES.some((p) => key.startsWith(p));
}
