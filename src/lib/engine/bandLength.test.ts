import { test } from "node:test";
import assert from "node:assert/strict";
import { describeLength } from "./bandLength.ts";
import type { PriceBand } from "../types.ts";

const band = (over: Partial<PriceBand>): PriceBand => ({
  id: "b",
  studio_id: "s",
  size_label: "Thing",
  hours_low: 1,
  hours_high: 2,
  sort_order: 0,
  requires_consultation: false,
  price_low_pence: null,
  price_high_pence: null,
  duration_minutes: null,
  ...over,
});

/*
 * The one that sent the model a degenerate range. A 45-minute cut was
 * described as "roughly 0.75–0.75 hours", which invites hedging about a number
 * that is not in doubt.
 */
test("a flat-price service is said in minutes", () => {
  assert.equal(
    describeLength(band({ price_low_pence: 3000, duration_minutes: 45, hours_low: 0.75, hours_high: 0.75 })),
    "45 minutes",
  );
});

test("a long one is said in hours, because nobody says 120 minutes", () => {
  assert.equal(
    describeLength(band({ price_low_pence: 12000, duration_minutes: 120 })),
    "2 hours",
  );
});

test("an awkward length keeps its half hour", () => {
  assert.equal(
    describeLength(band({ price_low_pence: 9000, duration_minutes: 150 })),
    "about 2.5 hours",
  );
});

/* An hour and a quarter is not said as 1.25 hours, so it stays in minutes. */
test("just over an hour stays in minutes", () => {
  assert.equal(
    describeLength(band({ price_low_pence: 4000, duration_minutes: 75 })),
    "75 minutes",
  );
});

test("work priced by the hour keeps its range, which is the honest answer", () => {
  assert.equal(describeLength(band({ hours_low: 3, hours_high: 5 })), "roughly 3–5 hours");
});

test("an hourly band with one length does not pretend to be a range", () => {
  assert.equal(describeLength(band({ hours_low: 2, hours_high: 2 })), "about 2 hours");
});

/* A flat price with no length falls back rather than inventing one. */
test("a flat price with no length falls back to the hours", () => {
  assert.equal(
    describeLength(band({ price_low_pence: 5000, duration_minutes: null, hours_low: 1, hours_high: 2 })),
    "roughly 1–2 hours",
  );
});
