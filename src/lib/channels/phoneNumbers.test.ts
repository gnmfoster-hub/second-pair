import { test } from "node:test";
import assert from "node:assert/strict";
import { readNumbers, tidyNumber, shouldRing } from "./phoneNumbers.ts";

function accepted(rawNumber: string, rawForward: string) {
  const r = readNumbers(rawNumber, rawForward);
  assert.equal(r.ok, true, r.ok ? "" : r.error);
  return r as Extract<typeof r, { ok: true }>;
}

function refused(rawNumber: string, rawForward: string) {
  const r = readNumbers(rawNumber, rawForward);
  assert.equal(r.ok, false, "should not have been accepted");
  return r as Extract<typeof r, { ok: false }>;
}

test("a number written the way a person writes it", () => {
  assert.equal(tidyNumber(" +44 7700 900-123 "), "+447700900123");
});

test("both numbers, in full international form", () => {
  const r = accepted("+447700900123", "+447700900456");
  assert.equal(r.number, "+447700900123");
  assert.equal(r.forwardTo, "+447700900456");
});

test("no ring-me number means text them at once, not an unfinished setting", () => {
  assert.equal(accepted("+447700900123", "   ").forwardTo, null);
});

test("no business number means hand the number back", () => {
  assert.equal(accepted("", "").number, null);
});

/*
 * This test used to assert the opposite, and it was wrong about the product
 * rather than about the code.
 *
 * A real number, bought that morning and read off the Twilio invoice as
 * 07860 123456, bounced off the form with a message about international
 * dialling. Nobody in this country writes their own number with a +44 on the
 * front, so the form was refusing the shape the answer actually arrives in.
 */
test("a number in the shape people say out loud is taken, and stored the way the line needs it", () => {
  assert.equal(accepted("07700 900123", "").number, "+447700900123");
  assert.equal(accepted("447700900123", "").number, "+447700900123");
});

test("the ring-me number is read the same forgiving way", () => {
  assert.equal(accepted("+447700900123", "07700 900456").forwardTo, "+447700900456");
});

/*
 * Forgiving about the shape is not the same as forgiving about the number, and
 * that is the line worth holding a test against: widening what counts as typing
 * it right must not widen what counts as a number.
 */
test("what is not a number is still not a number", () => {
  for (const bad of ["+44", "+0770090012", "hello", "07700", "0770090012345"]) {
    refused(bad, "");
  }
});

test("a bad ring-me number is caught even when it is the only thing typed", () => {
  assert.match(refused("", "0 7 7 0 0").error, /international/);
});

test("a call cannot be forwarded to itself, however it is punctuated", () => {
  assert.match(refused("+447700900123", "+44 7700 900-123").error, /ring itself/);
});

const OURS = "+441626000001";
const MOBILE = "+447700900123";

test("with nobody to ring, the caller is texted at once", () => {
  assert.equal(shouldRing(null, null, OURS), false);
});

test("an ordinary call rings the phone", () => {
  assert.equal(shouldRing(MOBILE, null, OURS), true);
  assert.equal(shouldRing(MOBILE, undefined, OURS), true);
});

test("a call diverted from that very phone does not ring it again", () => {
  assert.equal(shouldRing(MOBILE, MOBILE, OURS), false);
  // However the carrier punctuates it.
  assert.equal(shouldRing(MOBILE, "+44 7700 900-123", OURS), false);
});

test("a call diverted from our own number is a loop, whatever else is true", () => {
  assert.equal(shouldRing(MOBILE, OURS, OURS), false);
});

test("a divert from somewhere else is still worth ringing for", () => {
  assert.equal(shouldRing(MOBILE, "+441626999999", OURS), true);
});
