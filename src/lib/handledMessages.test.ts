import { test } from "node:test";
import assert from "node:assert/strict";
import { cutoff, KEEP_DAYS } from "./handledMessages.ts";

test("the cutoff is three days back, to the millisecond", () => {
  const now = new Date("2026-09-09T12:00:00.000Z");
  assert.equal(cutoff(now).toISOString(), "2026-09-06T12:00:00.000Z");
});

test("it is comfortably longer than any retry window", () => {
  // Meta gives up in hours. Anything under a day would be cutting it fine for
  // the sake of saving rows that cost nothing.
  assert.ok(KEEP_DAYS >= 2, `${KEEP_DAYS} days is too short to be safe`);
});

test("the cutoff moves with the clock rather than being fixed", () => {
  const a = cutoff(new Date("2026-09-09T12:00:00.000Z"));
  const b = cutoff(new Date("2026-09-10T12:00:00.000Z"));
  assert.equal(b.getTime() - a.getTime(), 24 * 60 * 60 * 1000);
});

test("a shorter window can be asked for, and is honoured", () => {
  const now = new Date("2026-09-09T12:00:00.000Z");
  assert.equal(cutoff(now, 1).toISOString(), "2026-09-08T12:00:00.000Z");
});
