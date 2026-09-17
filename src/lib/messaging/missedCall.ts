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
 * The one word somebody can send back to be rung.
 *
 * Exported because the text below promises it and the assistant has to honour
 * it, and those were two separate facts that could drift apart. They did: the
 * word appeared exactly once in the whole product — in the sentence promising
 * it — and nothing anywhere handled it. Whether a bare "CALL" got a callback
 * depended on the model reading one word as a request for a human.
 *
 * A shorthand is the right thing to offer here. Somebody who has just failed
 * to reach a business by phone is not in a position to type a paragraph, and
 * one word is the least they can send.
 */
export const CALLBACK_WORD = "CALL";

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
export function missedCallText(
  business: string,
  person?: string | null,
  /**
   * Whether they are, at this moment, being invited to leave a message.
   *
   * The text goes out as the call is handed to the answerphone, so on a
   * business with that switched on it lands while the caller is still
   * speaking. Asking them to type out what they need, in the same second they
   * are saying it out loud, reads as though nobody is listening — which is
   * precisely the impression the whole feature exists to avoid.
   *
   * It has to work both ways round, because at this point nobody knows whether
   * they will leave a message or ring off at the beep. So it offers both and
   * asks for neither twice.
   */
  canLeaveMessage = false,
): string {
  /*
   * It says it is an assistant, and it says how to stop.
   *
   * This read "this is Sarah at Willow & Co" — first person, a named human,
   * no hint of a machine — and it is the one message in the whole product that
   * goes to a stranger who never wrote to us. Every other channel discloses on
   * its first reply; this one introduced itself as somebody's colleague.
   *
   * And STOP: the webhook has honoured it since the day it was written, and
   * nothing ever told a customer it existed. One unasked-for text from a
   * number they do not know, with no way out of it, is exactly the shape of
   * message the rules about texting people are written for.
   */
  const who = person?.trim() ? `${person.trim()}'s assistant at ${business}` : `the assistant at ${business}`;

  const middle = canLeaveMessage
    ? `Leave your message and I'll text you straight back, or tell me here instead. ` +
      `Say ${CALLBACK_WORD} for a call.`
    : `Tell me what you need and I can help here, or say ${CALLBACK_WORD} and we'll ring you back.`;

  return `Sorry we missed your call — this is ${who}. ${middle} Reply STOP and we won't text again.`;
}
