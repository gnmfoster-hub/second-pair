import { test } from "node:test";
import assert from "node:assert/strict";
import { depositPaid, hasDeposit, depositOutstanding } from "./deposit.ts";

/*
 * The bug this exists to stop coming back. A studio with no Stripe account at
 * all read "Deposit paid" against an appointment nobody had paid for, because
 * anything typed into the diary by hand is stored as nothing, marked paid, to
 * keep the unpaid-hold sweep from cancelling it.
 */
test("nothing marked paid is not a paid deposit", () => {
  assert.equal(depositPaid({ deposit_amount_pence: 0, deposit_status: "paid" }), false);
  assert.equal(hasDeposit({ deposit_amount_pence: 0, deposit_status: "paid" }), false);
});

test("a real deposit that was paid is a paid deposit", () => {
  assert.equal(depositPaid({ deposit_amount_pence: 2500, deposit_status: "paid" }), true);
});

test("a real deposit that was not paid is not", () => {
  assert.equal(depositPaid({ deposit_amount_pence: 2500, deposit_status: "unpaid" }), false);
  assert.equal(depositPaid({ deposit_amount_pence: 2500, deposit_status: "link_sent" }), false);
});

test("what is worth chasing is a real deposit that has not arrived", () => {
  assert.equal(depositOutstanding({ deposit_amount_pence: 2500, deposit_status: "unpaid" }), true);
  assert.equal(depositOutstanding({ deposit_amount_pence: 2500, deposit_status: "paid" }), false);
  // The one that must never be chased: there was never anything to pay.
  assert.equal(depositOutstanding({ deposit_amount_pence: 0, deposit_status: "unpaid" }), false);
});

test("a row with nothing on it at all is not a paid deposit", () => {
  assert.equal(depositPaid({}), false);
  assert.equal(hasDeposit({}), false);
  assert.equal(depositOutstanding({}), false);
  assert.equal(depositPaid({ deposit_amount_pence: null, deposit_status: null }), false);
});
