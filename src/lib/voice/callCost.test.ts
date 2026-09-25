import { test } from "node:test";
import assert from "node:assert/strict";
import { callCost, addUpCalls, minutes, CALL_RATES } from "./callCost.ts";

test("every leg is billed in whole minutes, rounded up", () => {
  assert.equal(minutes(0), 0);
  assert.equal(minutes(1), 1);
  assert.equal(minutes(60), 1);
  assert.equal(minutes(61), 2);
});

/*
 * The ordinary case, and the one that matters: fifteen seconds ringing a
 * mobile nobody picks up. Nothing is recorded, nobody says anything, and it
 * still costs more than a text — because both legs round up to a minute.
 */
test("a missed call costs more than a text before anybody speaks", () => {
  const cost = callCost({ rangSeconds: 15, forwarded: true, recordedSeconds: 0, transcribed: false });

  assert.equal(cost.outPence, CALL_RATES.outPence, "one minute of ringing a mobile");
  assert.equal(cost.inPence, CALL_RATES.inPence, "one minute of them being connected");
  assert.equal(cost.recordingPence, 0);
  assert.equal(cost.transcriptionPence, 0);

  // 4.5p + 0.7p against 4p for a text out.
  assert.ok(cost.pence > 4, `expected more than a text, got ${cost.pence}p`);
});

/*
 * And with the answerphone on, which is the thing being sold separately. A
 * forty-second message adds a recorded minute and a transcribed minute, and
 * the transcription is dearer than the recording by twenty times.
 */
test("taking a message roughly doubles it", () => {
  const plain = callCost({ rangSeconds: 15, forwarded: true, recordedSeconds: 0, transcribed: false });
  const spoken = callCost({ rangSeconds: 15, forwarded: true, recordedSeconds: 40, transcribed: true });

  assert.equal(spoken.recordingPence, CALL_RATES.recordingPence);
  assert.equal(spoken.transcriptionPence, CALL_RATES.transcriptionPence);
  assert.ok(spoken.pence > plain.pence * 1.7, `${plain.pence}p → ${spoken.pence}p`);

  /*
   * Fifteen seconds ringing, eight of greeting and forty of message is
   * sixty-three seconds connected — which is two billed minutes, not one. That
   * rounding is most of the bill on short calls and the reason this is
   * modelled rather than averaged.
   */
  assert.equal(spoken.inPence, CALL_RATES.inPence * 2);
});

test("nobody rung is a leg we never paid for", () => {
  const cost = callCost({ rangSeconds: 0, forwarded: false, recordedSeconds: 30, transcribed: true });
  assert.equal(cost.outPence, 0);
  assert.ok(cost.inPence > 0, "they were still connected to us");
});

/*
 * The cheapest possible call is not a free one. A business with no ring-me
 * number has its callers hear a sentence and get texted — nobody is rung, no
 * message is taken, and it still costs an inbound minute. Pricing that at zero
 * is how a channel comes to look free.
 */
test("the cheapest call still costs a connected minute", () => {
  const cost = callCost({ rangSeconds: 0, forwarded: false, recordedSeconds: 0, transcribed: false });
  assert.equal(cost.outPence, 0, "nobody was rung");
  assert.equal(cost.recordingPence, 0);
  assert.equal(cost.pence, CALL_RATES.inPence);
});

/*
 * A recording kept but never transcribed is charged for once, not twice. The
 * difference matters: transcription is the single dearest per-minute rate on
 * the whole platform.
 */
test("transcription is only charged when it happened", () => {
  const kept = callCost({ rangSeconds: 0, forwarded: false, recordedSeconds: 30, transcribed: false });
  assert.equal(kept.transcriptionPence, 0);
  assert.ok(kept.recordingPence > 0);
});

test("a month of calls adds up, and says which part was dear", () => {
  const month = addUpCalls([
    { rangSeconds: 15, forwarded: true, recordedSeconds: 0, transcribed: false },
    { rangSeconds: 15, forwarded: true, recordedSeconds: 40, transcribed: true },
    { rangSeconds: 0, forwarded: false, recordedSeconds: 0, transcribed: false },
  ]);

  assert.equal(month.calls, 3);
  assert.equal(month.answerphone, 1, "one of them left a message");
  assert.equal(month.parts.outPence, CALL_RATES.outPence * 2, "two forwards");
  assert.ok(month.pence > 0);

  // Ringing the mobile is the biggest single line, which is the point.
  assert.ok(
    month.parts.outPence > month.parts.inPence,
    "the leg out should dominate a month of missed calls",
  );
});

/*
 * ── The Receptionist, which changed what a call costs ───────────────────────
 *
 * A missed call says one sentence and hangs up. A Receptionist call holds a
 * conversation: every word synthesised and billed by the character, and every
 * word heard billed by the minute. None of it was counted until now, which
 * made the dearest thing this product does read as the same price as the
 * cheapest.
 */

const MISSED = { rangSeconds: 15, forwarded: true, recordedSeconds: 0, transcribed: false };

test("a call where nothing was spoken costs exactly what it used to", () => {
  const before = callCost(MISSED);
  assert.equal(before.speakingPence, 0);
  assert.equal(before.listeningPence, 0);
  assert.equal(
    before.pence,
    before.inPence + before.outPence + before.recordingPence + before.transcriptionPence,
    "adding two meters must not quietly reprice the answerphone",
  );
});

test("speaking is billed by the character, not rounded to whole hundreds", () => {
  const short = callCost({ ...MISSED, spokenCharacters: 50, spokenTier: "generative" });
  const long = callCost({ ...MISSED, spokenCharacters: 100, spokenTier: "generative" });

  assert.ok(short.speakingPence > 0);
  assert.ok(
    Math.abs(long.speakingPence - short.speakingPence * 2) < 1e-9,
    "half the characters should be half the price; rounding up overstates every short sentence",
  );
  assert.ok(
    Math.abs(long.speakingPence - CALL_RATES.speakGenerativePer100) < 1e-9,
    "a hundred characters is one unit of the per-100 rate",
  );
});

test("the generative voice is four times the neural one, which is the trade taken", () => {
  const generative = callCost({ ...MISSED, spokenCharacters: 900, spokenTier: "generative" });
  const neural = callCost({ ...MISSED, spokenCharacters: 900, spokenTier: "neural" });

  assert.ok(generative.speakingPence > neural.speakingPence);
  assert.ok(
    Math.abs(generative.speakingPence / neural.speakingPence - 4) < 0.01,
    "four times, so the decision is visible rather than rounded away",
  );
  /* And still small: a six-turn call is pennies, not pounds. */
  assert.ok(generative.speakingPence < 15, "a whole call of talking should be pennies");
});

test("an unstated tier bills as the default, which is what will have spoken", () => {
  const stated = callCost({ ...MISSED, spokenCharacters: 500, spokenTier: "generative" });
  const unstated = callCost({ ...MISSED, spokenCharacters: 500 });
  assert.equal(unstated.speakingPence, stated.speakingPence);
});

test("listening is charged on top of being connected, by the minute", () => {
  const quiet = callCost({ ...MISSED, listenedSeconds: 0 });
  const chatty = callCost({ ...MISSED, listenedSeconds: 70 });

  assert.equal(quiet.listeningPence, 0);
  assert.equal(chatty.listeningPence, CALL_RATES.listenPence * 2, "70 seconds is two minutes");
  assert.ok(
    chatty.inPence > quiet.inPence,
    "time spent listening is also time the caller is connected",
  );
});

test("a month says how many calls were actually talked through", () => {
  const month = addUpCalls([
    MISSED,
    { ...MISSED, spokenCharacters: 900, spokenTier: "generative", listenedSeconds: 60 },
    { ...MISSED, spokenCharacters: 400, spokenTier: "generative", listenedSeconds: 30 },
  ]);

  assert.equal(month.calls, 3);
  assert.equal(month.spoken, 2, "two of them were Receptionist calls");
  assert.ok(month.parts.speakingPence > 0);
  assert.ok(month.parts.listeningPence > 0);
});
