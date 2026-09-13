/**
 * When a payment link should stop working.
 *
 * A link with no end is one that turns up in a text message eighteen months
 * later and charges somebody for an appointment they have long since had, or
 * sits in a screenshot on a phone that gets sold. Everything this sends has a
 * last moment.
 *
 * Stripe will not accept less than half an hour or more than a day, and both
 * ends are clamped here rather than thrown: somebody asking for a link that
 * lasts a week is asking for a perfectly reasonable thing, and the right
 * answer is the longest one available rather than an error about somebody
 * else's rules.
 *
 * In a file of its own with nothing imported, so it can be tested — the module
 * that uses it pulls in the Stripe SDK, which the test runner cannot load.
 */
export function expiryFor(hours: number, now: Date = new Date()): number {
  const seconds = Math.round(now.getTime() / 1000);
  const wanted = seconds + Math.round(hours * 3600);
  return Math.min(seconds + 24 * 3600, Math.max(seconds + 30 * 60, wanted));
}
