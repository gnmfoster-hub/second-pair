/**
 * What a phone call costs us, worked out from what we can actually observe.
 *
 * The telephone is the only channel with more than one meter running. A text
 * is one price for one message. A call bills four separate things, and two of
 * them are ours before the customer has said a word:
 *
 *   the leg in    — the caller reaching our number, per minute
 *   the leg out   — us ringing the owner's mobile, per minute, and this is the
 *                   dear one: a UK mobile costs roughly six times what the
 *                   inbound leg does
 *   the recording — per minute, if they leave a message
 *   the words     — transcription, per minute, and dearer than the recording
 *
 * Which is why this is worth selling as its own thing. A missed call that
 * rings a mobile for fifteen seconds and takes a forty-second message costs
 * more than a dozen texts, and until now nothing anywhere counted it.
 *
 * Every carrier bills whole minutes, rounded up, per leg — so a fifteen-second
 * ring is a minute and the rounding is most of the bill on short calls. That is
 * modelled rather than averaged away, because averaging it away is how a per-
 * call price ends up half of what it should be.
 */

/** Pence per minute, per leg. All of these are ours, not the business's. */
export type CallRates = {
  inPence: number;
  outPence: number;
  recordingPence: number;
  transcriptionPence: number;
};

/**
 * Twilio's published United Kingdom list prices, in pence a minute.
 *
 * Published, not invoiced. Every one of these is a number off a price page
 * converted at a round exchange rate, and the real bill has volume tiers, a
 * different rate for a mobile than a landline, and tax. They are here so that
 * the cost of a call is visible at roughly the right size instead of invisible
 * at zero — which is what it was.
 *
 * Replace them from the first Twilio invoice that has calls on it. Anything
 * shown from these is marked as an estimate wherever it appears, and should
 * stay marked until the invoice says otherwise.
 */
export const CALL_RATES: CallRates = {
  inPence: 0.7,
  /* A UK mobile. The single biggest cost in a missed call. */
  outPence: 4.5,
  recordingPence: 0.2,
  transcriptionPence: 4,
};

/**
 * Seconds we paid for on the number itself, before any forwarding.
 *
 * The caller is connected for the whole thing: the ring, whatever we say to
 * them, and the message they leave. Twilio reports the pieces at different
 * times and never the whole, so it is added up from what each webhook knows.
 *
 * SPOKEN is what the greeting and the sign-off take out loud — about eight
 * seconds of "we cannot pick up right now, say what you need after the tone".
 * It is a constant because it is the same sentence every time.
 */
export const SPOKEN_SECONDS = 8;

export type CallShape = {
  /** How long the owner's mobile rang. Zero when nobody was rung. */
  rangSeconds: number;
  /** Whether that leg went out at all — a forward we paid for. */
  forwarded: boolean;
  /** How long the message was. Zero when none was left. */
  recordedSeconds: number;
  /** Whether those words went off to be transcribed. */
  transcribed: boolean;
};

/** Whole minutes, rounded up, the way every carrier bills a leg. */
export function minutes(seconds: number): number {
  return seconds <= 0 ? 0 : Math.ceil(seconds / 60);
}

/**
 * The four meters, added up.
 *
 * Returned in pieces as well as a total, because the whole point of costing
 * the telephone separately is to be able to say which part of it is dear —
 * and on most calls the answer is the fifteen seconds spent ringing a mobile
 * nobody picked up.
 */
export function callCost(
  call: CallShape,
  rates: CallRates = CALL_RATES,
): { inPence: number; outPence: number; recordingPence: number; transcriptionPence: number; pence: number } {
  /*
   * Every call that reaches us is connected, so every call costs at least one
   * inbound minute — the carrier's floor, not ours.
   *
   * This only added the spoken seconds when somebody was rung or a message was
   * left, which priced a business with no ring-me number at nothing a call.
   * Those callers still reach us and still hear a sentence; the cheapest
   * possible outcome is a minute, not free. A channel that reads as free is
   * the exact mistake this file exists to stop.
   */
  const connected = call.rangSeconds + call.recordedSeconds + SPOKEN_SECONDS;

  const inPence = minutes(connected) * rates.inPence;
  const outPence = call.forwarded ? minutes(call.rangSeconds) * rates.outPence : 0;
  const recordingPence = minutes(call.recordedSeconds) * rates.recordingPence;
  const transcriptionPence = call.transcribed ? minutes(call.recordedSeconds) * rates.transcriptionPence : 0;

  return {
    inPence,
    outPence,
    recordingPence,
    transcriptionPence,
    pence: inPence + outPence + recordingPence + transcriptionPence,
  };
}

/** The same for a month of them, which is what a bill is made of. */
export function addUpCalls(
  calls: CallShape[],
  rates: CallRates = CALL_RATES,
): { calls: number; answerphone: number; pence: number; parts: Record<string, number> } {
  const parts = { inPence: 0, outPence: 0, recordingPence: 0, transcriptionPence: 0 };
  let pence = 0;
  let answerphone = 0;

  for (const call of calls) {
    const one = callCost(call, rates);
    parts.inPence += one.inPence;
    parts.outPence += one.outPence;
    parts.recordingPence += one.recordingPence;
    parts.transcriptionPence += one.transcriptionPence;
    pence += one.pence;
    if (call.recordedSeconds > 0) answerphone++;
  }

  return { calls: calls.length, answerphone, pence, parts };
}
