/**
 * Somebody rang and nobody picked up.
 *
 * The most ordinary way a one-person business loses work: the phone goes while
 * they are up a ladder or holding a pair of scissors, it rings out, and that
 * customer rings the next name on the list. Nothing about it is recoverable
 * afterwards — there is no message, no missed enquiry to answer later, just a
 * number in a call log that most people never ring back.
 *
 * So the call is offered to them first, and only if it is not answered does a
 * text go out. That text is sent from the same number they rang, which is the
 * whole trick: their reply arrives as an ordinary text message, the assistant
 * picks it up like any other, and what began as a missed call is a
 * conversation. Their number is known from the call itself, so the one thing
 * the assistant usually has to ask for is already on file.
 */

/** What Twilio calls it when the call was picked up by a person. */
const ANSWERED = new Set(["completed", "answered"]);

/**
 * Whether the call went unanswered.
 *
 * Unknown counts as missed. If the status is something we have never seen, a
 * text arrives after a call that was actually answered — mildly redundant, and
 * the alternative is silence after a call that was not, which is the failure
 * this exists to prevent.
 */
export function wasMissed(dialStatus: string | null | undefined): boolean {
  return !ANSWERED.has(String(dialStatus ?? "").trim().toLowerCase());
}

/**
 * The text that goes back.
 *
 * Deliberately not written by the assistant. There is nothing to reply to yet,
 * so a model would be inventing an opening from nothing, and this one has to
 * be right every time: it is the first thing a stranger reads from a business
 * that just failed to answer their call.
 *
 * It apologises, says who it is, and asks a question — because a text that
 * only apologises invites no answer, and the point is to start a conversation
 * rather than to be polite about having missed one.
 */
export function missedCallText(business: string, person?: string | null): string {
  const who = person?.trim() ? `${person.trim()} at ${business}` : business;
  return (
    `Sorry we missed your call — this is ${who}. ` +
    "Tell me what you need and I can help here, or say CALL and we'll ring you back."
  );
}
