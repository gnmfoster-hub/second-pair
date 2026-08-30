import { test } from "node:test";
import assert from "node:assert/strict";
import { quoteForBand, quoteForStudio, depositFor, FULL_DAY_HOURS } from "./quote.ts";
import type { Artist, PriceBand } from "./types.ts";

const artist = (over: Partial<Artist> = {}): Artist => ({
  id: "a",
  studio_id: "s",
  name: "Test",
  styles: [],
  hourly_rate_pence: 12000, // £120/hr
  min_charge_pence: 8000, // £80
  day_rate_pence: null,
  calendar_id: null,
  active: true,
  booking_provider: "native",
  ical_url: null,
  booking_url: null,
  avatar_path: null,
  colour: null,
  ...over,
});

const band = (low: number, high: number): PriceBand => ({
  id: "b",
  studio_id: "s",
  size_label: "Test",
  hours_low: low,
  hours_high: high,
  sort_order: 0,
  requires_consultation: false,
});

test("quotes the hourly rate across the band", () => {
  const q = quoteForBand(artist(), band(2, 3));
  assert.equal(q.low_pence, 24000);
  assert.equal(q.high_pence, 36000);
  assert.equal(q.hit_minimum, false);
});

test("never quotes below the minimum charge", () => {
  // 0.5h x £120 = £60, under the £80 minimum.
  const q = quoteForBand(artist(), band(0.5, 1));
  assert.equal(q.low_pence, 8000);
  assert.equal(q.hit_minimum, true);
});

test("rounding never pushes the low end under the minimum", () => {
  // £83 minimum would round down to £80 if the clamp came before the rounding.
  const q = quoteForBand(artist({ min_charge_pence: 8300 }), band(0.5, 1));
  assert.equal(q.low_pence, 8300);
});

test("the high end is never below the low end", () => {
  const q = quoteForBand(artist({ min_charge_pence: 50000 }), band(0.5, 1));
  assert.ok(q.high_pence >= q.low_pence);
});

test("a day rate applies only from a full day and only when cheaper", () => {
  const a = artist({ day_rate_pence: 60000 }); // £600/day vs £120 x 6h = £720
  const full = quoteForBand(a, band(FULL_DAY_HOURS, FULL_DAY_HOURS));
  assert.equal(full.low_pence, 60000);

  // Under a full day the hourly rate still applies.
  const short = quoteForBand(a, band(2, 2));
  assert.equal(short.low_pence, 24000);

  // An expensive day rate is ignored in the client's favour.
  const pricey = quoteForBand(artist({ day_rate_pence: 99000 }), band(6, 6));
  assert.equal(pricey.low_pence, 72000);
});

test("studio range spans active artists only", () => {
  const cheap = artist({ id: "1", hourly_rate_pence: 10000 });
  const dear = artist({ id: "2", hourly_rate_pence: 20000 });
  const inactive = artist({ id: "3", hourly_rate_pence: 90000, active: false });

  const q = quoteForStudio([cheap, dear, inactive], band(2, 2))!;
  assert.equal(q.low_pence, 20000);
  assert.equal(q.high_pence, 40000);
});

test("studio range is null with no artists", () => {
  assert.equal(quoteForStudio([], band(1, 2)), null);
});

test("percentage deposits respect their floor and round up", () => {
  const q = { low_pence: 24000, high_pence: 36000, hit_minimum: false };
  assert.equal(depositFor({ type: "percent", percent: 20, min_pence: 5000 }, q), 5000);
  assert.equal(depositFor({ type: "percent", percent: 30, min_pence: 5000 }, q), 7500);
  assert.equal(depositFor({ type: "fixed", amount_pence: 5000 }, q), 5000);
});
