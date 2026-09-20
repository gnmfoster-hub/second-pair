import { test } from "node:test";
import assert from "node:assert/strict";
import { supplyOf, NUMBER_MONTHLY_PENCE, type SuppliedNumber } from "./numberCost.ts";

const number = (extra: Partial<SuppliedNumber> = {}): SuppliedNumber => ({
  externalId: "+447700900123",
  forWho: null,
  active: true,
  since: "2026-09-20",
  ...extra,
});

test("nothing supplied costs nothing", () => {
  assert.deepEqual(supplyOf([]), { live: 0, off: 0, monthlyPence: 0 });
});

test("two live numbers cost two rentals", () => {
  const s = supplyOf([number(), number({ forWho: "Aisha" })]);
  assert.equal(s.live, 2);
  assert.equal(s.monthlyPence, NUMBER_MONTHLY_PENCE * 2);
});

/*
 * The one worth counting separately.
 *
 * A number switched off in the product has not been handed back to Twilio, and
 * the invoice does not know the difference. Counting only the live ones would
 * understate the bill in exactly the case worth noticing: somebody who has
 * stopped using something we are still paying for.
 */
test("a switched-off number is counted apart, not ignored", () => {
  const s = supplyOf([number(), number({ active: false })]);
  assert.equal(s.live, 1);
  assert.equal(s.off, 1);
  assert.equal(s.monthlyPence, NUMBER_MONTHLY_PENCE, "an off number is not billed as live");
});

test("whose it is does not change what it costs", () => {
  const business = supplyOf([number({ forWho: null })]);
  const hers = supplyOf([number({ forWho: "Aisha" })]);
  assert.equal(business.monthlyPence, hers.monthlyPence);
});
