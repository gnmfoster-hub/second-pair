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
};

/**
 * Whether this one is asking for something, which is the only state that gets
 * to lean. See the .stamp-live rule: one stamp on a slant among a dozen
 * straight ones is where the eye lands before a word has been read.
 */
export const isAsking = (status: ConvStatus) => status === "needs_human";

/** Finished business. Still readable, still clickable, no longer competing. */
export const isSpent = (status: ConvStatus) => status === "lost" || status === "spam";

/** Everything a status needs on a mark, ready to drop into a className. */
export function stampClasses(status: ConvStatus): string {
  return [STATUS_TONE[status], isAsking(status) ? "stamp-live" : "", isSpent(status) ? "stamp-spent" : ""]
    .filter(Boolean)
    .join(" ");
}
