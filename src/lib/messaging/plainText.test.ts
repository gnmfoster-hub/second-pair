import { test } from "node:test";
import assert from "node:assert/strict";
import { forSms, fitsGsm7, smsSegments } from "./plainText.ts";

test("curly punctuation is straightened", () => {
  assert.equal(forSms("Priya’s got Thursday"), "Priya's got Thursday");
  assert.equal(forSms("“cut and blow dry”"), '"cut and blow dry"');
  assert.equal(forSms("Hi Sam — you’re booked"), "Hi Sam - you're booked");
  assert.equal(forSms("one moment…"), "one moment...");
});

test("a pound sign is left alone — it is in the cheap alphabet", () => {
  assert.equal(forSms("That's £45"), "That's £45");
  assert.ok(fitsGsm7("That's £45"));
});

test("paragraph breaks become single lines", () => {
  assert.equal(forSms("Booked.\n\nAnything else?"), "Booked.\nAnything else?");
});

/*
 * The whole point. One curly apostrophe in an ordinary reply doubles the bill,
 * because the alphabet is chosen for the message rather than the character.
 */
test("one curly apostrophe doubles the cost of a reply", () => {
  const written =
    "That’s you booked in, Jo — Thursday 10 September at 9:00am with Priya at " +
    "The Fold Hair. A cut and blow dry is £45, an estimate Priya confirms on the day.";

  assert.ok(!fitsGsm7(written));
  const before = smsSegments(written);
  const after = smsSegments(forSms(written));

  assert.ok(fitsGsm7(forSms(written)));
  assert.ok(after < before, `expected fewer segments, got ${before} then ${after}`);
  assert.equal(before, 3);
  assert.equal(after, 1);
});

test("segment counting knows where the boundaries are", () => {
  assert.equal(smsSegments(""), 0);
  assert.equal(smsSegments("a".repeat(160)), 1);
  assert.equal(smsSegments("a".repeat(161)), 2);
  assert.equal(smsSegments("’".repeat(70)), 1);
  assert.equal(smsSegments("’".repeat(71)), 2);
});

test("meaning is never changed, only spelling", () => {
  const t = "Dave’s free Thursday — 9:00 or 9:30. £80 to £120.";
  assert.equal(forSms(t), "Dave's free Thursday - 9:00 or 9:30. £80 to £120.");
});
