import { test } from "node:test";
import assert from "node:assert/strict";
import {
  billFor,
  textsLeft,
  costOfServing,
  marginOf,
  monthOf,
  monthBefore,
  monthName,
  DEFAULT_PLAN,
  type Used,
} from "./billing.ts";

const quiet: Used = { textsOut: 142, textsIn: 40, emailsOut: 20, modelMicros: 2_510_000 };
const typical: Used = { textsOut: 527, textsIn: 160, emailsOut: 60, modelMicros: 10_050_000 };
const busy: Used = { textsOut: 1317, textsIn: 400, emailsOut: 150, modelMicros: 25_130_000 };

test("inside the bundle, the bill is just the plan", () => {
  const { lines, totalPence } = billFor(DEFAULT_PLAN, quiet);
  assert.equal(totalPence, 3900);
  assert.equal(lines.length, 1, "no extras line when there are no extras");
  assert.equal(textsLeft(DEFAULT_PLAN, quiet), 158);
});

test("past the bundle, the extras are a line of their own", () => {
  const { lines, totalPence } = billFor(DEFAULT_PLAN, typical);
  assert.equal(totalPence, 3900 + 227 * 8);
  assert.equal(lines[1].what, "Extra texts");
  assert.match(lines[1].detail, /227 past the bundle at 8p/);
  assert.equal(textsLeft(DEFAULT_PLAN, typical), 0);
});

/*
 * A customer texting the business costs us money and is never billed on.
 * Charging somebody for a message they received turns a renewal into an
 * argument.
 */
test("only texts we send count against the bundle", () => {
  const allInbound: Used = { textsOut: 0, textsIn: 900, emailsOut: 0, modelMicros: 0 };
  assert.equal(billFor(DEFAULT_PLAN, allInbound).totalPence, 3900);
});

test("an unlimited plan never adds an extras line", () => {
  const unlimited = { planPence: 9900, textsIncluded: null, overagePence: 0 };
  assert.equal(billFor(unlimited, busy).totalPence, 9900);
  assert.equal(textsLeft(unlimited, busy), null);
});

test("what a month costs us is the measured model plus what was sent", () => {
  // 251p model + 142 texts out at 4p + 40 in at 0.75p + 20 emails + £1 number
  assert.equal(costOfServing(quiet), Math.round(251 + 568 + 30 + 0.6 + 100));
});

test("every size makes money on the plan I would pick", () => {
  for (const used of [quiet, typical, busy]) {
    const bill = billFor(DEFAULT_PLAN, used);
    const margin = marginOf(bill.totalPence, costOfServing(used));
    assert.ok(margin.pence > 0, `${used.textsOut} texts loses money: ${margin.pence}p`);
    assert.ok(margin.percent >= 20, `${used.textsOut} texts is thin: ${margin.percent}%`);
  }
});

test("a business we are paying to keep shows as negative, not as zero", () => {
  const flat = { planPence: 2900, textsIncluded: null, overagePence: 0 };
  const margin = marginOf(billFor(flat, busy).totalPence, costOfServing(busy));
  assert.ok(margin.pence < 0);
  assert.ok(margin.percent < 0);
});

test("a month is the first of it, wherever the clock is", () => {
  assert.equal(monthOf(new Date("2026-09-16T23:30:00Z")), "2026-09-01");
  assert.equal(monthOf(new Date("2026-01-01T00:00:00Z")), "2026-01-01");
  assert.equal(monthBefore("2026-01-01"), "2025-12-01");
  assert.equal(monthBefore("2026-09-01"), "2026-08-01");
  assert.equal(monthName("2026-09-01"), "September 2026");
});
