import type { ConvStatus } from "./types";

/**
 * What a conversation's state looks like, in one place.
 *
 * It was defined twice: once on the inbox and once on the conversation page,
 * and the two had drifted apart. Qualified was green in the list and plain grey
 * on the page you opened from it — the same word, about the same conversation,
 * two seconds apart. Two copies of a look is how a product stops having one.
 *
 * Three meanings and no more, or it becomes bunting:
 *
 *   green   money is coming, or has
 *   orange  somebody is waiting on a person — the only orange in a list
 *   grey    nothing to do here
 *
 * New keeps the accent rather than a fourth colour: it is not yet good news and
 * it is not yet a job, it is just recent.
 */
export const STATUS_TONE: Record<ConvStatus, string> = {
  new: "text-accent",
  qualified: "text-ok",
  deposit_paid: "text-ok",
  booked: "text-ok",
  needs_human: "text-highlight-strong",
  lost: "text-muted",
  spam: "text-muted",
  // Nothing to do, and nothing wrong either: the business's own post.
  paperwork: "text-muted",
};

/**
 * Whether this one is asking for something, which is the only state that gets
 * to lean. See the .stamp-live rule: one stamp on a slant among a dozen
 * straight ones is where the eye lands before a word has been read.
 */
export const isAsking = (status: ConvStatus) => status === "needs_human";

/** Finished business. Still readable, still clickable, no longer competing. */
export const isSpent = (status: ConvStatus) =>
  status === "lost" || status === "spam" || status === "paperwork";

/**
 * Whether there was ever a customer here, and so whether it belongs in a
 * figure.
 *
 * Every report, count and average in the product is about enquiries. Spam has
 * been left out of all of them from the start — by four separate places each
 * writing `status !== "spam"` in its own words, which was fine while there was
 * one thing to leave out.
 *
 * Paperwork is the second, and four copies of a rule is how a rule drifts.
 * This file exists because status colour was defined twice and a conversation
 * that was Qualified green in the inbox came out grey on its own page. So the
 * question gets asked in one place, and a business's report stops counting the
 * receipts from its own shop as enquiries it answered.
 */
export const countsAsEnquiry = (status: string | null | undefined) =>
  status !== "spam" && status !== "paperwork";

/** Everything a status needs on a mark, ready to drop into a className. */
export function stampClasses(status: ConvStatus): string {
  return [STATUS_TONE[status], isAsking(status) ? "stamp-live" : "", isSpent(status) ? "stamp-spent" : ""]
    .filter(Boolean)
    .join(" ");
}
