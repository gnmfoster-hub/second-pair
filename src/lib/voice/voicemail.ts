/**
 * Taking a message, and doing something with it.
 *
 * A missed call already becomes a text: "sorry we missed you, what can we do
 * for you?" That works, and it throws away the one thing the caller has
 * already done — said what they wanted. Half of them will not type it out
 * again, and a plumber up a ladder at four o'clock is exactly the person who
 * rang rather than typed in the first place.
 *
 * So: let them say it. The message is written down, handed to the assistant as
 * though they had texted it, and answered by text with a real answer — a time,
 * a price, a booking — rather than an invitation to start again.
 *
 * The recording itself is deleted as soon as it has been read. We want what
 * they said, not a library of people's voices, and a recording nobody needs is
 * only ever a thing to lose.
 *
 * Pure and alone in its file: what a caller hears is worth reading without a
 * telephony library in the way.
 */

/**
 * What the caller hears before the beep.
 *
 * Short, because people hang up on a machine. It still has to say three
 * things: who they have reached, that they are being recorded and written
 * down, and what happens next — a recording notice after the beep is not a
 * notice, and "we'll get back to you" is what every voicemail says and nobody
 * believes.
 */
export function whatTheyHear(business: string | null, person: string | null): string {
  const who = person ? `${person} at ${business ?? "us"}` : (business ?? "us");
  return (
    `Thanks for calling ${who}. We cannot pick up right now, ` +
    `so say what you need after the tone and we will text you straight back. ` +
    `Your message is written down and sent to the business. Press hash when you are done.`
  );
}

/**
 * What came back from the transcriber, or nothing usable.
 *
 * Three things arrive here that are not a message: a failed transcription, an
 * empty one, and a couple of words of hiss from somebody who rang off at the
 * beep. All three are the same outcome — there is nothing to answer — and the
 * plain "sorry we missed you" text has already gone either way, so nothing is
 * lost by saying so.
 */
export function readTranscript(
  status: string | null | undefined,
  text: string | null | undefined,
): string | null {
  if ((status ?? "").toLowerCase() !== "completed") return null;

  const said = (text ?? "").trim().replace(/\s+/g, " ");
  if (!said) return null;

  /*
   * Three words, because two is a cough.
   *
   * Transcribers do not return silence, they return their best guess at it —
   * "Thank you", "Okay", "Hello" — and answering one of those as though it
   * were an enquiry produces a text that reads like a wrong number.
   */
  if (said.split(" ").length < 3) return null;

  return said.slice(0, 1500);
}

/**
 * How it reaches the assistant.
 *
 * Marked as spoken, because it changes how it should be read: a transcript has
 * no punctuation worth trusting, names come out wrong, and a number said out
 * loud arrives as words. The assistant is better at all of that when it knows
 * what it is looking at, and a customer who hears their name back wrong needs
 * the assistant to have been warned rather than confident.
 */
export function asMessage(said: string): string {
  return `[Voicemail, transcribed — wording may be approximate] ${said}`;
}

/** What a voicemail is claimed under, so one is never answered twice. */
export function voicemailKey(recordingSid: string): string {
  return `voicemail:${recordingSid}`;
}
