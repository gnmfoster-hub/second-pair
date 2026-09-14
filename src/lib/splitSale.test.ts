import { test } from "node:test";
import assert from "node:assert/strict";
import { splitSale } from "./splitSale.ts";

test("a counter sale is all shelf and nothing taken against a booking", () => {
  const v = splitSale({ kind: "product", grossPence: 1450, shelfLines: [] });
  assert.deepEqual(v, { shelfPence: 1450, takenPence: 0 });
});

test("a counter sale with lines is still its own gross", () => {
  // The lines are what it was made of, not a subset of it.
  const v = splitSale({
    kind: "product",
    grossPence: 2900,
    shelfLines: [{ quantity: 2, unitPence: 1450 }],
  });
  assert.equal(v.shelfPence, 2900);
});

/*
 * The one this file exists for. A £95 colour with a £14.50 bottle on the same
 * bill is £109.50 taken and £14.50 sold — not £109.50 of both, which is what
 * counting the gross as a sale would have reported.
 */
test("a bill is the work plus the shelf, and only the shelf is a sale", () => {
  const v = splitSale({
    kind: "payment",
    grossPence: 10950,
    shelfLines: [{ quantity: 1, unitPence: 1450 }],
  });
  assert.equal(v.shelfPence, 1450);
  assert.equal(v.takenPence, 10950);
});

test("a bill with no shelf on it sells nothing", () => {
  const v = splitSale({ kind: "payment", grossPence: 9500, shelfLines: [] });
  assert.equal(v.shelfPence, 0);
  assert.equal(v.takenPence, 9500);
});

test("two of something counts twice", () => {
  const v = splitSale({
    kind: "payment",
    grossPence: 12400,
    shelfLines: [{ quantity: 2, unitPence: 1450 }],
  });
  assert.equal(v.shelfPence, 2900);
});

test("a deposit is money taken and nothing sold", () => {
  const v = splitSale({ kind: "deposit", grossPence: 2500, shelfLines: [] });
  assert.deepEqual(v, { shelfPence: 0, takenPence: 2500 });
});

/*
 * A total corrected downwards after the lines were written would otherwise
 * report more sold off the shelf than was paid in all — a number that cannot
 * be true and would be believed, because it is on the takings screen.
 */
test("the shelf can never exceed what was actually paid", () => {
  const v = splitSale({
    kind: "payment",
    grossPence: 1000,
    shelfLines: [{ quantity: 1, unitPence: 1450 }],
  });
  assert.equal(v.shelfPence, 1000);
});

test("a payment with no amount on it contributes nothing", () => {
  assert.deepEqual(splitSale({ kind: "payment", grossPence: null, shelfLines: [] }), {
    shelfPence: 0,
    takenPence: 0,
  });
  assert.deepEqual(splitSale({ kind: "product", grossPence: null, shelfLines: [] }), {
    shelfPence: 0,
    takenPence: 0,
  });
});
