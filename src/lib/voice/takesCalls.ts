/**
 * Whether this business answers the telephone at all.
 *
 * Not the same question as having a number. Texts come with the number; the
 * telephone is bought on its own, because unlike every other channel it spends
 * real money before a word is said. The caller's leg is billed, and the leg out
 * to the owner's mobile is billed far dearer, both rounded up to a whole
 * minute, whether or not anybody books anything.
 *
 * Written down here because four places were each asking it in their own words
 * and one of them was asking a different question. The webhook and the
 * missed-call route both checked for "voice". The settings screen checked for
 * "sms" and then showed the answerphone tick box, so a business with the
 * telephone switched off in the back office was offered a feature it had not
 * bought, could tick it, and it saved. Nothing then happened, because a call to
 * the number never reaches the code that reads it.
 *
 * Web when nothing is set, which is what every business started with, and which
 * means no.
 */
export function takesCalls(channelsAllowed: string[] | null | undefined): boolean {
  return (channelsAllowed ?? ["web"]).includes("voice");
}
