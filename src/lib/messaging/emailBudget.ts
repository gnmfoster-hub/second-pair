/**
 * How much of a business's email the assistant may answer in a day.
 *
 * Spam already costs nothing: the rules in inboundEmail run before the model
 * is touched, and a newsletter, a no-reply notice or anything carrying an
 * unsubscribe link is thrown away or parked without a single token being
 * spent. That is the important half and it is already true.
 *
 * What is not guarded is the other half — mail that reads like a person. A
 * determined spammer who writes in prose, a mailing list that forwards
 * individually, or a forwarding loop between two mailboxes all look exactly
 * like customers to a rule, and each one costs a model call and sends a reply.
 * The widget has had a ceiling since the day it went public, for precisely
 * this reason, and email has had none.
 *
 * So there is a ceiling, and going past it is not a failure: the mail is put
 * in the inbox with a note saying why, which is what happens to anything the
 * assistant will not answer on its own. A business that genuinely gets forty
 * emails in a day reads the rest itself, which is what it did before this
 * product existed.
 *
 * Pure and alias-free: the rule is worth being sure about without a database,
 * and the number in it is a commercial decision that somebody will want to
 * change.
 */

export type EmailBudget = {
  /** Answered by the assistant, per business, per day. */
  perDay: number;
};

/*
 * Forty a day.
 *
 * A salon that gets forty genuine email enquiries in one day is a salon doing
 * very well, and would notice the fortieth going unanswered. A loop or a
 * scripted sender reaches forty before lunch. The number is meant to sit
 * comfortably above the first and well below the second — and to be the thing
 * somebody changes when a real business proves it wrong, rather than a
 * constant buried in a route.
 */
export const ORDINARY_EMAIL: EmailBudget = { perDay: 40 };

/**
 * Whether to answer this one, or put it in the inbox for a person.
 *
 * Returns the reason to park, in the owner's words, or null to carry on.
 */
export function tooMuchEmail(
  answeredToday: number,
  budget: EmailBudget = ORDINARY_EMAIL,
): string | null {
  if (answeredToday < budget.perDay) return null;

  return (
    `the assistant has already answered ${budget.perDay} emails for you today, ` +
    `so the rest are waiting here for a person`
  );
}

/**
 * Midnight this morning, in UTC.
 *
 * Deliberately not the business's own timezone. The ceiling exists to bound
 * spending rather than to describe a working day, and a window that moves with
 * the clocks is one more thing to be wrong about at two in the morning in
 * March.
 */
export function sinceMidnight(now = new Date()): string {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  return start.toISOString();
}
