import { test } from "node:test";
import assert from "node:assert/strict";
import { outwardCode, postcodeArea, coversPostcode, withTravelTime } from "./travel.ts";

// ---------------------------------------------------------------- postcodes

test("the outward code is everything but the last three characters", () => {
  assert.equal(outwardCode("SW1A 1AA"), "SW1A");
  assert.equal(outwardCode("M1 1AE"), "M1");
  assert.equal(outwardCode("B33 8TH"), "B33");
  assert.equal(outwardCode("bs16 1qy"), "BS16");
});

test("a partial postcode is treated as already outward", () => {
  // People type "BS16" when asked where they are.
  assert.equal(outwardCode("BS16"), "BS16");
  assert.equal(outwardCode("BS"), "BS");
});

test("the area is the letters at the start", () => {
  assert.equal(postcodeArea("SW1A 1AA"), "SW");
  assert.equal(postcodeArea("M1 1AE"), "M");
  assert.equal(postcodeArea("BS16 1QY"), "BS");
});

// ---------------------------------------------------------------- coverage

test("no areas listed means everywhere is covered", () => {
  assert.equal(coversPostcode([], "SW1A 1AA"), true);
});

test("an area letter covers everything inside it", () => {
  assert.equal(coversPostcode(["BS"], "BS16 1QY"), true);
  assert.equal(coversPostcode(["BS"], "BS1 4DJ"), true);
});

test("somewhere outside the area is not covered", () => {
  assert.equal(coversPostcode(["BS", "BA"], "M1 1AE"), false);
});

test("a specific outward code can be listed", () => {
  assert.equal(coversPostcode(["BS16"], "BS16 1QY"), true);
  assert.equal(coversPostcode(["BS16"], "BS1 4DJ"), false);
});

test("a similar-looking area is not a match", () => {
  // B and BS are different places; a Birmingham sparky does not cover Bristol.
  assert.equal(coversPostcode(["B"], "BS16 1QY"), false);
});

test("no postcode given cannot be assumed to be in area", () => {
  assert.equal(coversPostcode(["BS"], ""), false);
});

// ---------------------------------------------------------------- travel time

test("travel time pads a job on both sides", () => {
  const [padded] = withTravelTime(
    [{ starts_at: "2026-09-01T10:00:00Z", ends_at: "2026-09-01T11:00:00Z" }],
    30,
  );
  assert.equal(padded.starts_at, "2026-09-01T09:30:00.000Z");
  assert.equal(padded.ends_at, "2026-09-01T11:30:00.000Z");
});

test("no buffer leaves the diary exactly as it is", () => {
  const busy = [{ starts_at: "2026-09-01T10:00:00Z", ends_at: "2026-09-01T11:00:00Z" }];
  assert.deepEqual(withTravelTime(busy, 0), busy);
});

test("padding is what stops two jobs being booked across town", () => {
  // A 10:00–11:00 job with 30 minutes either side blocks 09:30–11:30, so an
  // 11:00 start is no longer offerable.
  const [padded] = withTravelTime(
    [{ starts_at: "2026-09-01T10:00:00Z", ends_at: "2026-09-01T11:00:00Z" }],
    30,
  );
  const wouldClash =
    Date.parse("2026-09-01T11:00:00Z") < Date.parse(padded.ends_at) &&
    Date.parse("2026-09-01T12:00:00Z") > Date.parse(padded.starts_at);
  assert.equal(wouldClash, true);
});
