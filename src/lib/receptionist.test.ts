import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mayTurnOn,
  liveInstances,
  chargeableCount,
  describeInstances,
} from "./receptionist.ts";

const business = { who: null, on: true };
const aisha = { who: "Aisha", on: true };
const off = { who: "Sam", on: false };

/*
 * Absent reads as off. A deploy can land before its migration, and a business
 * that has never been sold this has not asked for it.
 */
test("anything but a true entitlement is no entitlement", () => {
  assert.equal(mayTurnOn(undefined), false);
  assert.equal(mayTurnOn(null), false);
  assert.equal(mayTurnOn("yes"), false);
  assert.equal(mayTurnOn(1), false);
  assert.equal(mayTurnOn(true), true);
});

/*
 * The one that matters for the bill: switches left set from before an add-on
 * lapsed must not keep costing. Stopping it is one change, not a hunt through
 * every person in the diary.
 */
test("nothing is chargeable without the entitlement, however many switches are on", () => {
  assert.equal(chargeableCount(false, [business, aisha]), 0);
  assert.deepEqual(liveInstances(false, [business, aisha]), []);
});

test("both levels count, and each one counts once", () => {
  assert.equal(chargeableCount(true, [business, aisha, off]), 2);
});

test("switched off is not charged", () => {
  assert.equal(chargeableCount(true, [off]), 0);
});

test("none at all is none, not a fault", () => {
  assert.equal(chargeableCount(true, []), 0);
  assert.equal(describeInstances(true, []), "Nobody has one switched on.");
});

test("it says which lines have one", () => {
  assert.equal(
    describeInstances(true, [business, aisha]),
    "On for the business’s own line and Aisha.",
  );
  assert.equal(describeInstances(true, [aisha]), "On for Aisha.");
  assert.equal(describeInstances(true, [business]), "On for the business’s own line.");
});

test("not sold it is said as not sold it, never as nobody has one", () => {
  assert.equal(describeInstances(false, [business, aisha]), "Not on this plan.");
});
