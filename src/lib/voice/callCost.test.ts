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
