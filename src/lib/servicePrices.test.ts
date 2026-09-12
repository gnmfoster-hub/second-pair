import { test } from "node:test";
import assert from "node:assert/strict";
import { resolvePrice, describePrice } from "./servicePrices.ts";

const cut = { minutes: 45, price_pence: 3000, price_to_pence: null };
const colour = { minutes: 120, price_pence: 12000, price_to_pence: 16000 };

test("uses the list when a person has set nothing", () => {
  assert.deepEqual(resolvePrice(cut, null), {
    minutes: 45,
    price_pence: 3000,
    price_to_pence: null,
    theirs: false,
  });
});

test("takes a person's own price over the list", () => {
  const p = resolvePrice(cut, { minutes: null, price_pence: 4500 });
  assert.equal(p.price_pence, 4500);
  assert.equal(p.theirs, true);
});

test("lets somebody be quicker without changing what they charge", () => {
  const p = resolvePrice(cut, { minutes: 30, price_pence: null });
  assert.equal(p.minutes, 30);
  assert.equal(p.price_pence, 3000);
  assert.equal(p.theirs, true);
});

/*
 * The one that would quote a spread nobody meant: a senior naming £150
 * against a list that says "£120 to £160" must not be quoted "£150 to £160".
 */
test("collapses the range once somebody names their own price", () => {
  const p = resolvePrice(colour, { minutes: null, price_pence: 15000 });
  assert.equal(p.price_pence, 15000);
  assert.equal(p.price_to_pence, null);
  assert.equal(describePrice(p), "£150");
});

test("keeps the range when only the time is theirs", () => {
  const p = resolvePrice(colour, { minutes: 90, price_pence: null });
  assert.equal(describePrice(p), "£120 to £160");
});

/*
 * Zero is a price. Treating it as "nothing set" would make a free
 * consultation look unpriced, and ?? rather than || is the whole reason
 * this holds.
 */
test("treats a free service as priced, not unpriced", () => {
  const p = resolvePrice(cut, { minutes: null, price_pence: 0 });
  assert.equal(p.price_pence, 0);
  assert.equal(p.theirs, true);
  assert.equal(describePrice(p), "£0");
});

test("says so plainly when nothing is priced at all", () => {
  const p = resolvePrice({ minutes: 30, price_pence: null, price_to_pence: null }, null);
  assert.equal(describePrice(p), "no price set");
});
