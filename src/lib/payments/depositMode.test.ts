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
