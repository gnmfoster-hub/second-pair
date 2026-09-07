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

test("a number in the shape people say out loud is refused", () => {
  for (const bad of ["07700900123", "447700900123", "+44", "+0770090012", "hello"]) {
    refused(bad, "");
  }
});

test("a bad ring-me number is caught even when it is the only thing typed", () => {
  assert.match(refused("", "07700900456").error, /international/);
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
