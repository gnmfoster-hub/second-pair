import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldAsk, looksLikeEmail, mayTake } from "./receiptEmail.ts";

test("asked only where money changed hands", () => {
  assert.equal(shouldAsk({ contactId: "c1", email: null, tookMoney: true }), true);
  assert.equal(shouldAsk({ contactId: "c1", email: null, tookMoney: false }), false);
});

test("not asked of somebody who already has an address", () => {
  assert.equal(shouldAsk({ contactId: "c1", email: "them@example.com", tookMoney: true }), false);
  assert.equal(shouldAsk({ contactId: "c1", email: "  ", tookMoney: true }), true);
});

/*
 * A walk-in with no record is nobody to save an address against.
 */
test("not asked where there is no client record", () => {
  assert.equal(shouldAsk({ contactId: null, email: null, tookMoney: true }), false);
});

test("it catches what somebody types in a hurry", () => {
  assert.equal(looksLikeEmail("dave"), false);
  assert.equal(looksLikeEmail("dave@"), false);
  assert.equal(looksLikeEmail("dave@example"), false);
  assert.equal(looksLikeEmail("dave @example.com"), false);
  assert.equal(looksLikeEmail("dave@example.com"), true);
  assert.equal(looksLikeEmail("  dave@example.co.uk  "), true);
});

test("an address is stored the way addresses are compared", () => {
  const out = mayTake("  Dave@Example.COM ", null);
  assert.deepEqual(out, { ok: true, email: "dave@example.com" });
});

/*
 * The one that matters. Somebody reads an address out at a counter, at speed,
 * to a person holding a card machine. A typo landing on top of a good address
 * would take every future reminder with it, silently, for as long as it took
 * anybody to notice.
 */
test("an address already on the record is never overwritten", () => {
  const out = mayTake("typo@example.com", "theirs@example.com");
  assert.equal(out.ok, false);
  assert.match(out.ok === false ? out.because : "", /already have an address/);
});

test("nothing typed is refused before anything else", () => {
  assert.equal(mayTake("   ", null).ok, false);
});
