import { test } from "node:test";
import assert from "node:assert/strict";
import { whoTakes, netOf, payableFor } from "./whoTakes.ts";

const SHOP = "acct_shop";
const HERS = "acct_sarah";

const shop = {
  payment_model: "business" as const,
  takes_payments: true,
  deposit_mode: "optional",
  stripe_account_id: SHOP,
};

const sarah = { id: "sarah", stripe_account_id: HERS };

// ───────────────────────────────────────────────── one account for the shop

test("on the business model the money goes to the shop", () => {
  const v = whoTakes(shop, sarah, "payment");
  assert.equal(v.ok && v.account, SHOP);
  assert.equal(v.ok && v.whose, "business");
});

test("a shop with no Stripe cannot take anything, and says so", () => {
  const v = whoTakes({ ...shop, stripe_account_id: null }, sarah, "payment");
  assert.equal(v.ok, false);
  assert.match(v.ok === false ? v.because : "", /not connected Stripe/i);
});

// ─────────────────────────────────────────────────── an account per person

const renters = { ...shop, payment_model: "people" as const };

test("on the per-person model the money goes to the person", () => {
  const v = whoTakes(renters, sarah, "payment");
  assert.equal(v.ok && v.account, HERS);
  assert.equal(v.ok && v.whose, "person");
  assert.equal(v.ok && v.fellBack, undefined);
});

test("it cannot be taken at all without knowing who it is for", () => {
  const v = whoTakes(renters, null, "payment");
  assert.equal(v.ok, false);
  assert.match(v.ok === false ? v.because : "", /without knowing who/i);
});

/*
 * The question that needed answering rather than guessing at. Somebody who has
 * not finished Stripe's onboarding has nowhere for the money to go, and both
 * answers are defensible — so the owner picks, and off means refuse.
 */
test("with no account of their own and no fallback, it refuses and explains", () => {
  const v = whoTakes(renters, { id: "jade" }, "payment");
  assert.equal(v.ok, false);
  assert.match(v.ok === false ? v.because : "", /not connected their own Stripe/i);
});

test("with the fallback on, it goes to the business and is marked as such", () => {
  const v = whoTakes({ ...renters, payment_fallback: true }, { id: "jade" }, "payment");
  assert.equal(v.ok && v.account, SHOP);
  assert.equal(v.ok && v.whose, "business");
  assert.equal(v.ok && v.fellBack, true);
});

/* Falling back to an account that does not exist is not falling back. */
test("the fallback cannot rescue a business with no Stripe either", () => {
  const v = whoTakes(
    { ...renters, payment_fallback: true, stripe_account_id: null },
    { id: "jade" },
    "payment",
  );
  assert.equal(v.ok, false);
  assert.match(v.ok === false ? v.because : "", /neither has the business/i);
});

// ────────────────────────────────────────── both switches have to agree

test("a business not taking payments refuses, whoever asks", () => {
  const v = whoTakes({ ...shop, takes_payments: false }, sarah, "payment");
  assert.equal(v.ok, false);
  assert.match(v.ok === false ? v.because : "", /does not take payments/i);
});

test("a person not taking payments refuses, even where the business does", () => {
  const v = whoTakes(shop, { ...sarah, takes_payments: false }, "payment");
  assert.equal(v.ok, false);
  assert.match(v.ok === false ? v.because : "", /this person/i);
});

test("deposits and payments are separate questions", () => {
  // Takes deposits, not payments — which is most trades.
  const invoices = { ...shop, takes_payments: false, deposit_mode: "required" };
  assert.equal(whoTakes(invoices, sarah, "deposit").ok, true);
  assert.equal(whoTakes(invoices, sarah, "payment").ok, false);

  // And the other way round: everything on the day, no deposit ever.
  const onTheDay = { ...shop, takes_payments: true, deposit_mode: "none" };
  assert.equal(whoTakes(onTheDay, sarah, "deposit").ok, false);
  assert.equal(whoTakes(onTheDay, sarah, "payment").ok, true);
});

/*
 * Before the migration runs the person's switches are absent rather than
 * false, and absent must not read as "no" — the business-level switch is doing
 * the gating in that case.
 */
test("a person whose switches do not exist yet is not refused by them", () => {
  const v = whoTakes(shop, { id: "nobody-knows", stripe_account_id: HERS }, "payment");
  assert.equal(v.ok, true);
});

// ──────────────────────────────────────────────────────────── the money

test("net is gross less the fee", () => {
  assert.equal(netOf(4800, 91), 4709);
});

test("a fee that never arrived leaves net unknown rather than wrong", () => {
  assert.equal(netOf(4800, null), null);
  assert.equal(netOf(4800, undefined), null);
});

// ─────────────────────────────────────────── who a card link can be offered for

test("on the per-person model only the people with their own account can be paid by card", () => {
  const jade = { id: "jade", stripe_account_id: null };
  const people = payableFor({ ...renters, stripe_account_id: null }, [sarah, jade]);
  assert.deepEqual(people.map((p) => p.id), ["sarah"]);
});

test("with the fallback on and a shop account, everybody can be paid by card", () => {
  const jade = { id: "jade", stripe_account_id: null };
  const people = payableFor({ ...renters, payment_fallback: true }, [sarah, jade]);
  assert.deepEqual(people.map((p) => p.id), ["sarah", "jade"]);
});

test("on the business model nobody can be paid by card until the shop connects", () => {
  assert.equal(payableFor({ ...shop, stripe_account_id: null }, [sarah]).length, 0);
  assert.equal(payableFor(shop, [sarah]).length, 1);
});
