/**
 * What the business is called, on somebody's own channel.
 *
 * A chair renter is a business inside a business. Aisha rents a chair at Willow
 * & Co and trades as Hair by Aisha: her clients found her, not the salon, and
 * on her own number, her own link and her own Instagram the assistant was
 * introducing itself as the salon. That is the wrong name on the one channel
 * where it is definitely hers.
 *
 * Giles asked for it in those words: each team member picks their agent name
 * and their business name if they want, and if they do not it defaults to the
 * overall business.
 *
 * So this is the same shape as assistantName, deliberately. Two settings that
 * answer the same question about the same conversation should not behave
 * differently, and a stylist who has set one will expect the other to work the
 * way it did.
 */

/**
 * Whose name applies here.
 *
 * The person's own where the conversation belongs to one, then the business's.
 * There is no third fallback: every business has a name, so unlike the
 * assistant there is always something true to say.
 *
 * Blank counts as unset. A box somebody cleared and saved means "use the
 * salon's", and storing "" would otherwise produce an assistant answering for
 * nothing at all.
 */
export function tradingName(
  studio: { name?: string | null } | null | undefined,
  artist?: { trading_name?: string | null } | null,
): string {
  const theirs = artist?.trading_name?.trim();
  if (theirs) return theirs;
  return studio?.name?.trim() || "this business";
}

/**
 * Whether this person trades under their own name here.
 *
 * Worth asking separately from what the name is, because the answer changes
 * what else is true: somebody trading as themselves is the business as far as
 * that customer is concerned, so the assistant should not offer them a
 * colleague or talk about "the salon" as a third party.
 */
export function tradesOwn(
  studio: { name?: string | null } | null | undefined,
  artist?: { trading_name?: string | null } | null,
): boolean {
  const theirs = artist?.trading_name?.trim();
  return Boolean(theirs) && theirs !== studio?.name?.trim();
}
