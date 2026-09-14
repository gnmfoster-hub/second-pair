import { test } from "node:test";
import assert from "node:assert/strict";
import { depositReadiness, nameThem, type DepositReadiness } from "./depositReadiness.ts";

const base: DepositReadiness = {
  takesDeposits: true,
  model: "business",
  businessAccount: true,
  fallback: false,
  waiting: [],
  taking: 0,
  platformReady: true,
};

const state = (over: Partial<DepositReadiness> = {}): DepositReadiness => ({ ...base, ...over });

// ────────────────────────────────────────────────────── nothing to be ready for

test("a business that does not take deposits is settled, not unfinished", () => {
  const v = depositReadiness(state({ takesDeposits: false, businessAccount: false }));
  assert.equal(v.ready, true);
  assert.equal(v.otherwise, "");
});

// ───────────────────────────────────────────────────────────────────── ours

test("the platform key missing is not ready, and says it is ours", () => {
  const v = depositReadiness(state({ platformReady: false }));
  assert.equal(v.ready, false);
  assert.match(v.otherwise, /on Second Pair/i);
});

test("and offers no button, because there is nothing for them to press", () => {
  assert.equal(depositReadiness(state({ platformReady: false })).action, "");
});

test("ours is asked before theirs — an unconnected shop still hears about us first", () => {
  const v = depositReadiness(state({ platformReady: false, businessAccount: false }));
  assert.match(v.otherwise, /on Second Pair/i);
});

// ──────────────────────────────────────────────────────── one shop, one account

test("the shop's account connected is ready", () => {
  assert.equal(depositReadiness(state()).ready, true);
});

test("the shop's account missing names the shop's fix", () => {
  const v = depositReadiness(state({ businessAccount: false }));
  assert.equal(v.ready, false);
  assert.equal(v.action, "Connect Stripe");
});

// ─────────────────────────────────────────────────────── an account each

const people = (over: Partial<DepositReadiness> = {}) =>
  state({ model: "people", businessAccount: false, taking: 2, ...over });

test("everybody connected is ready", () => {
  assert.equal(depositReadiness(people({ waiting: [] })).ready, true);
});

/*
 * The one this file exists for. Before it, this business read as ready — the
 * shop's account was connected, the old check asked about nothing else, and
 * every charge was refused.
 */
test("the shop's account does not make a per-person salon ready", () => {
  const v = depositReadiness(people({ businessAccount: true, waiting: ["Sarah"] }));
  assert.equal(v.ready, false);
});

test("it names who, because the fix belongs to them", () => {
  const v = depositReadiness(people({ waiting: ["Sarah"] }));
  assert.match(v.otherwise, /Sarah takes deposits and has not connected/);
});

test("and says only they can do it", () => {
  assert.match(depositReadiness(people({ waiting: ["Sarah"] })).otherwise, /Only they can/);
});

test("two people read as two people", () => {
  const v = depositReadiness(people({ waiting: ["Sarah", "Mark"], taking: 2 }));
  assert.match(v.otherwise, /Sarah and Mark take deposits and have not/);
});

test("deposits on for the business and off for every person is not ready", () => {
  const v = depositReadiness(people({ taking: 0, waiting: [] }));
  assert.equal(v.ready, false);
  assert.match(v.otherwise, /in theory and none in practice/);
});

// ─────────────────────────────────────────────────────────────── the fallback

test("with the fallback on and a shop account, a deposit can still be paid", () => {
  const v = people({ businessAccount: true, fallback: true, waiting: ["Sarah"] });
  assert.equal(depositReadiness(v).ready, true);
});

test("but it says whose account it is landing in, which is the whole point", () => {
  const v = depositReadiness(people({ businessAccount: true, fallback: true, waiting: ["Sarah"] }));
  assert.match(v.fallingBack ?? "", /land in the business account/);
});

/*
 * Ready and worth saying are different things, and collapsing them would cost
 * one or the other: a failed check here would be crying wolf, and no field at
 * all would leave a chair renter paid into the shop account with nothing
 * anywhere saying so.
 */
test("falling back is not a failure — the deposit is taken either way", () => {
  const v = depositReadiness(people({ businessAccount: true, fallback: true, waiting: ["Sarah"] }));
  assert.equal(v.ready, true);
  assert.equal(v.otherwise, "");
});

test("nobody falling back means nothing to say about it", () => {
  assert.equal(depositReadiness(people({ waiting: [] })).fallingBack, undefined);
  assert.equal(depositReadiness(state()).fallingBack, undefined);
});

test("the fallback with no shop account to fall back to is not ready", () => {
  const v = depositReadiness(people({ businessAccount: false, fallback: true, waiting: ["Sarah"] }));
  assert.equal(v.ready, false);
});

// ───────────────────────────────────────────────────────────────────── naming

test("nameThem reads like a sentence", () => {
  assert.equal(nameThem([]), "");
  assert.equal(nameThem(["Sarah"]), "Sarah");
  assert.equal(nameThem(["Sarah", "Mark"]), "Sarah and Mark");
  assert.equal(nameThem(["Sarah", "Mark", "Jo"]), "Sarah, Mark and 1 other");
  assert.equal(nameThem(["Sarah", "Mark", "Jo", "Pat"]), "Sarah, Mark and 2 others");
});
