import { test } from "node:test";
import assert from "node:assert/strict";
import { marginOf, type Sold } from "./margin.ts";

const oil = (over: Partial<Sold> = {}): Sold => ({
  name: "Cuticle oil",
  quantity: 1,
  unitPence: 900,
  costPence: 342,
  ...over,
});

test("it works out what was made on a thing", () => {
  const out = marginOf([oil()]);
  assert.equal(out.tookPence, 900);
  assert.equal(out.costPence, 342);
  assert.equal(out.madePence, 558);
  assert.equal(out.percent, 62);
});

test("quantity counts", () => {
  const out = marginOf([oil({ quantity: 3 })]);
  assert.equal(out.tookPence, 2700);
  assert.equal(out.madePence, 1674);
  assert.equal(out.lines[0].sold, 3);
});

test("the same thing sold twice is one line", () => {
  const out = marginOf([oil(), oil({ quantity: 2 })]);
  assert.equal(out.lines.length, 1);
  assert.equal(out.lines[0].sold, 3);
});

/*
 * A shop that has never filled the cost in should see nothing, not a margin of
 * 100% — which is the number an empty cost column produces and is a lie with a
 * decimal point on it.
 */
test("a line with no cost is left out and counted", () => {
  const out = marginOf([oil(), oil({ name: "Blow dry", costPence: null })]);
  assert.equal(out.lines.length, 1);
  assert.equal(out.unknown, 1);
  assert.equal(out.tookPence, 900);
});

test("nothing with a cost gives no figures at all", () => {
  const out = marginOf([oil({ costPence: null })]);
  assert.deepEqual(out.lines, []);
  assert.equal(out.percent, null);
  assert.equal(out.unknown, 1);
});

/*
 * Nought taken is not a nought per cent margin, it is no sale.
 */
test("nothing taken is no percentage rather than none per cent", () => {
  assert.equal(marginOf([]).percent, null);
  assert.equal(marginOf([oil({ unitPence: 0, costPence: 0 })]).percent, null);
});

/*
 * Selling at a loss happens, and is exactly what somebody needs telling.
 */
test("a loss is reported as a loss", () => {
  const out = marginOf([oil({ unitPence: 300, costPence: 342 })]);
  assert.equal(out.madePence, -42);
  assert.equal(out.percent, -14);
});

test("the most profitable thing is first", () => {
  const out = marginOf([
    oil({ name: "Small", unitPence: 500, costPence: 400 }),
    oil({ name: "Big", unitPence: 4000, costPence: 1000 }),
  ]);
  assert.deepEqual(out.lines.map((l) => l.name), ["Big", "Small"]);
});
