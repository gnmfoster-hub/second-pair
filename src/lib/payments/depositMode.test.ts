import { test } from "node:test";
import assert from "node:assert/strict";
import { effectiveDepositMode, readyForRealMoney } from "./depositMode.ts";

import type { TakesDeposits } from "./depositMode.ts";

const studio = (over: Partial<TakesDeposits>) => over as TakesDeposits;

test("a business with an account takes what it asked for", () => {
  assert.equal(
    effectiveDepositMode(studio({ deposit_mode: "required", stripe_account_id: "acct_1" })),
    "required",
  );
  assert.equal(
    effectiveDepositMode(studio({ deposit_mode: "optional", stripe_account_id: "acct_1" })),
    "optional",
  );
});

/*
 * The case this exists for. Deposits are one click in settings; a Stripe
 * account is a form with a bank account on it. Between the two, the assistant
 * was quoting deposits nobody could pay.
 */
test("wanting a deposit without an account takes none", () => {
  assert.equal(
    effectiveDepositMode(studio({ deposit_mode: "required", stripe_account_id: null })),
    "none",
  );
  assert.equal(
    effectiveDepositMode(studio({ deposit_mode: "optional", stripe_account_id: null })),
    "none",
  );
});

test("none stays none either way", () => {
  assert.equal(effectiveDepositMode(studio({ deposit_mode: "none", stripe_account_id: "acct_1" })), "none");
  assert.equal(effectiveDepositMode(studio({ deposit_mode: "none", stripe_account_id: null })), "none");
});

test("an empty account id is not an account", () => {
  assert.equal(readyForRealMoney(studio({ stripe_account_id: "" })), false);
  assert.equal(
    effectiveDepositMode(studio({ deposit_mode: "required", stripe_account_id: "" })),
    "none",
  );
});

test("each person paid into their own: a person with an account can take one", () => {
  const people = studio({ deposit_mode: "required", stripe_account_id: null, payment_model: "people" });
  assert.equal(readyForRealMoney(people, { stripe_account_id: "acct_p" }), true);
  assert.equal(readyForRealMoney(people, { stripe_account_id: null }), false);
  assert.equal(effectiveDepositMode(people, [{ stripe_account_id: null }, { stripe_account_id: "acct_p" }]), "required");
  assert.equal(effectiveDepositMode(people, [{ stripe_account_id: null }]), "none");
});

test("each person paid into their own: the business account is only used when the owner chose it", () => {
  const noFallback = studio({ deposit_mode: "optional", stripe_account_id: "acct_b", payment_model: "people", payment_fallback: false });
  assert.equal(readyForRealMoney(noFallback, { stripe_account_id: null }), false);
  const fallback = studio({ deposit_mode: "optional", stripe_account_id: "acct_b", payment_model: "people", payment_fallback: true });
  assert.equal(readyForRealMoney(fallback, { stripe_account_id: null }), true);
  assert.equal(effectiveDepositMode(fallback), "optional");
});

test("somebody who does not take deposits cannot be charged one", () => {
  const people = studio({ deposit_mode: "required", stripe_account_id: "acct_b", payment_model: "people", payment_fallback: true });
  assert.equal(readyForRealMoney(people, { stripe_account_id: "acct_p", takes_deposits: false }), false);
});

