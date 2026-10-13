/**
 * Is this message a one-time code rather than a customer?
 *
 * Giles, 12 October. A verification code was texted to Second Pair's own
 * number at 08:39 on the 11th, in the middle of resubmitting to Meta:
 *
 *   "736049 is your confirmation c0de. For your security, do not share this
 *    c0de."
 *
 * The number is wired in as an SMS channel, so it landed in the inbox as a
 * conversation and the assistant answered it with the privacy notice. It never
 * reached a phone. Any code from a bank, a registrar or Meta does the same, and
 * the one time it matters is the one time somebody is waiting for it.
 *
 * Two things are wrong with that and this fixes both: the owner should be
 * buzzed with the code in their hand, and the assistant should not spend a
 * reply, a model call and a text on a robot that is not listening.
 *
 * THE RISK HERE IS THE FALSE POSITIVE, NOT THE MISS. Treating a real customer
 * as paperwork means their message is never answered, which is far worse than
 * an unanswered robot. So this is deliberately narrow: three separate things
 * must all be true, and the tests carry a list of real messages that must
 * never match.
 */

/** A run of 4 to 8 digits, which is what a code is and a phone number is not. */
const CODE = /(?<!\d)(\d{4,8})(?!\d)/;

/**
 * Phrases that only appear in automated codes.
 *
 * "code" on its own is not enough. Customers say "what's your postcode", "the
 * code on the back of the card", "my gate code is 4521". It has to be code AND
 * the shape of a code being issued.
 */
const SAYS_SO = [
  /\b(?:is|as)\s+your\s+(?:\w+\s+){0,2}(?:code|pin|password|otp)\b/i,
  /\b(?:verification|confirmation|security|one[-\s]?time|login|access|auth\w*)\s+(?:code|pin|key)\b/i,
  /\bdo not share\b/i,
  /\bnever share\b/i,
  /\byour\s+(?:\w+\s+){0,2}code\s+is\b/i,
  /\bone[-\s]?time\s+p(?:ass)?(?:code|word)\b/i,
  /\bOTP\b/,
  /^<#>/,
];

/**
 * Deliberate misspellings, which senders use to dodge carrier filters and
 * which were in the real message: "c0de" rather than "code".
 */
const unmangle = (s: string) =>
  s
    .replace(/c0de/gi, "code")
    .replace(/p1n\b/gi, "pin")
    .replace(/’/g, "'");

/**
 * Long enough to be a person.
 *
 * Codes are short. A customer writing two hundred characters about their car
 * is not a robot, even if a number in it looks like a code. Generous, because
 * some code texts carry an app link and a legal line.
 */
const TOO_LONG_TO_BE_A_CODE = 320;

export type FoundCode = { code: string; why: string };

/**
 * The code, or null for everything else.
 *
 * @param body what arrived
 */
export function oneTimeCodeIn(body: string | null | undefined): FoundCode | null {
  const raw = (body ?? "").trim();
  if (!raw || raw.length > TOO_LONG_TO_BE_A_CODE) return null;

  const text = unmangle(raw);

  /*
   * A question is a person. "Did you get my code?" carries every other signal
   * and is plainly somebody talking, so it is ruled out before anything else.
   */
  if (/\?/.test(text)) return null;

  const digits = text.match(CODE);
  if (!digits) return null;

  const said = SAYS_SO.find((r) => r.test(text));
  if (!said) return null;

  return { code: digits[1], why: said.source.slice(0, 40) };
}
