import { test } from "node:test";
import assert from "node:assert/strict";
import { expiryFor } from "./expiry.ts";

const NOW = new Date("2026-09-14T12:00:00Z");
const at = (seconds: number) => Math.round(NOW.getTime() / 1000) + seconds;

test("an ordinary few hours is those few hours", () => {
  assert.equal(expiryFor(4, NOW), at(4 * 3600));
});

/*
 * Stripe will not take less than half an hour or more than a day. Both are
 * clamped rather than thrown, because somebody asking for a week is asking for
 * a reasonable thing and deserves the longest answer available rather than an
 * error about somebody else's rules.
 */
test("a week becomes the longest Stripe allows", () => {
  assert.equal(expiryFor(24 * 7, NOW), at(24 * 3600));
});

test("five minutes becomes the shortest Stripe allows", () => {
  assert.equal(expiryFor(5 / 60, NOW), at(30 * 60));
});

test("nothing, or a mistake, still lands inside the window", () => {
  assert.equal(expiryFor(0, NOW), at(30 * 60));
  assert.equal(expiryFor(-3, NOW), at(30 * 60));
});

test("exactly a day is exactly a day", () => {
  assert.equal(expiryFor(24, NOW), at(24 * 3600));
});
