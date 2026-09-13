import { test } from "node:test";
import assert from "node:assert/strict";
import { samePhone } from "./phoneNumbers.ts";

/*
 * The bug this exists for, found on the live demo the first time a whole
 * conversation was run through it.
 *
 * A customer types 07700 900312. The number the same customer arrived on by
 * text is stored as +447700900312. Compared literally those are two different
 * people, so within one minute the demo held two Leila Osmans — her history
 * split, and the fifteen minutes extra her cut needs attached to the half of
 * her nobody was booking.
 */
test("the way people type a number and the way it is stored are the same number", () => {
  assert.equal(samePhone("07700900312"), "+447700900312");
  assert.equal(samePhone("+447700900312"), "+447700900312");
  assert.equal(samePhone("447700900312"), "+447700900312");
});

test("spacing and punctuation are not part of a phone number", () => {
  assert.equal(samePhone("07700 900312"), "+447700900312");
  assert.equal(samePhone("07700-900-312"), "+447700900312");
  assert.equal(samePhone("(07700) 900312"), "+447700900312");
  assert.equal(samePhone(" +44 7700 900312 "), "+447700900312");
});

test("a landline is the same landline", () => {
  assert.equal(samePhone("01626 123456"), "+441626123456");
});

/*
 * Guessing a country code is how two people who are not the same person get
 * merged into one record, which is worse than the duplicate it would prevent.
 */
test("anything already international is left exactly as it is", () => {
  assert.equal(samePhone("+13105550123"), "+13105550123");
  assert.equal(samePhone("+353871234567"), "+353871234567");
});

test("something that is not a recognisable number is tidied and no more", () => {
  assert.equal(samePhone("12345"), "12345");
  assert.equal(samePhone("ask for Dave"), "askforDave");
});

test("nothing is nothing, not a country code", () => {
  assert.equal(samePhone(""), "");
  assert.equal(samePhone(null), "");
  assert.equal(samePhone(undefined), "");
  assert.equal(samePhone("   "), "");
});

/* Running it twice must not change the answer, since stored values go through
 * it again on the next lookup. */
test("normalising an already normalised number changes nothing", () => {
  const once = samePhone("07700900312");
  assert.equal(samePhone(once), once);
});
