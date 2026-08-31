import { test } from "node:test";
import assert from "node:assert/strict";
import {
  quoteForBand,
  quoteForStudio,
  depositFor,
  withVat,
  FULL_DAY_HOURS,
  type VatSettings,
} from "./quote.ts";
import type { Artist, PriceBand } from "./types.ts";

const artist = (over: Partial<Artist> = {}): Artist => ({
  id: "a",
  studio_id: "s",
  name: "Test",
  handle: "test",
  hours: null,
  user_id: null,
  greeting: null,
  tone: null,
  calendar_token: "t".repeat(64),
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

const band = (low: number, high: number, over: Partial<PriceBand> = {}): PriceBand => ({
  id: "b",
  studio_id: "s",
  size_label: "Test",
  hours_low: low,
  hours_high: high,
  sort_order: 0,
  requires_consultation: false,
  price_low_pence: null,
  price_high_pence: null,
  duration_minutes: null,
  ...over,
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

// ---------------------------------------------------------------- flat prices

test("a flat price is used exactly as typed", () => {
  // £18, from a barber whose hourly rate would say something else entirely.
  const q = quoteForBand(artist(), band(0.5, 0.5, { price_low_pence: 1800, duration_minutes: 30 }));
  assert.equal(q.low_pence, 1800);
  assert.equal(q.high_pence, 1800);
});

test("a flat price ignores the minimum charge", () => {
  // The minimum charge protects an hourly rate. Applying it to a price the
  // owner typed in would quietly overcharge their customers.
  const q = quoteForBand(
    artist({ min_charge_pence: 8000 }),
    band(0.5, 0.5, { price_low_pence: 1800, duration_minutes: 30 }),
  );
  assert.equal(q.low_pence, 1800);
  assert.equal(q.hit_minimum, false);
});

test("a flat price is never rounded", () => {
  // £47 must stay £47, not become £45 or £50.
  const q = quoteForBand(artist(), band(1, 1, { price_low_pence: 4700, duration_minutes: 45 }));
  assert.equal(q.low_pence, 4700);
});

test("a flat price can be a range", () => {
  const q = quoteForBand(
    artist(),
    band(3, 4, { price_low_pence: 18000, price_high_pence: 24000, duration_minutes: 210 }),
  );
  assert.equal(q.low_pence, 18000);
  assert.equal(q.high_pence, 24000);
});

test("a flat price ignores the day rate", () => {
  const q = quoteForBand(
    artist({ day_rate_pence: 40000 }),
    band(8, 8, { price_low_pence: 50000, duration_minutes: 480 }),
  );
  assert.equal(q.low_pence, 50000);
});

test("hourly bands are untouched by any of this", () => {
  const q = quoteForBand(artist(), band(2, 3));
  assert.equal(q.low_pence, 24000);
  assert.equal(q.high_pence, 36000);
});

test("a studio range spans fixed and hourly bands alike", () => {
  const cheap = artist({ id: "1", hourly_rate_pence: 10000 });
  const fixed = band(1, 1, { price_low_pence: 2500, duration_minutes: 30 });
  const q = quoteForStudio([cheap], fixed)!;
  assert.equal(q.low_pence, 2500);
});

// ---------------------------------------------------------------- VAT

const vat = (over: Partial<VatSettings> = {}): VatSettings => ({
  vat_registered: true,
  vat_rate_percent: 20,
  prices_include_vat: true,
  ...over,
});

test("a business that is not VAT registered says nothing about VAT", () => {
  // Mentioning VAT when you are not registered is misleading, not just noise.
  const shown = withVat(
    { low_pence: 18000, high_pence: 24000, hit_minimum: false },
    vat({ vat_registered: false }),
  );
  assert.equal(shown.low_pence, 18000);
  assert.equal(shown.note, "");
});

test("VAT-inclusive prices are quoted as entered", () => {
  const shown = withVat({ low_pence: 4500, high_pence: 4500, hit_minimum: false }, vat());
  assert.equal(shown.low_pence, 4500);
  assert.equal(shown.note, "including VAT");
});

test("ex-VAT prices have VAT added before quoting", () => {
  // £300 + 20% = £360. Quoting £300 to a consumer would be wrong by £60.
  const shown = withVat(
    { low_pence: 30000, high_pence: 30000, hit_minimum: false },
    vat({ prices_include_vat: false }),
  );
  assert.equal(shown.low_pence, 36000);
  assert.match(shown.note, /including VAT at 20%/);
});

test("a non-standard rate is honoured", () => {
  const shown = withVat(
    { low_pence: 10000, high_pence: 10000, hit_minimum: false },
    vat({ prices_include_vat: false, vat_rate_percent: 5 }),
  );
  assert.equal(shown.low_pence, 10500);
});

test("a range has VAT applied to both ends", () => {
  const shown = withVat(
    { low_pence: 30000, high_pence: 50000, hit_minimum: false },
    vat({ prices_include_vat: false }),
  );
  assert.equal(shown.low_pence, 36000);
  assert.equal(shown.high_pence, 60000);
});
