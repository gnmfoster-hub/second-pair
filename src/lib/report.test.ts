import { test } from "node:test";
import assert from "node:assert/strict";
import { isOutOfHours, lastWeek } from "./report.ts";
import type { OpeningHours } from "./types.ts";

const TZ = "Europe/London";

// Weekdays 10:00–18:00, closed at the weekend.
const HOURS: OpeningHours[] = [
  { day: 0, open: "10:00", close: "18:00", closed: true },
  { day: 1, open: "10:00", close: "18:00", closed: false },
  { day: 2, open: "10:00", close: "18:00", closed: false },
  { day: 3, open: "10:00", close: "18:00", closed: false },
  { day: 4, open: "10:00", close: "18:00", closed: false },
  { day: 5, open: "10:00", close: "18:00", closed: false },
  { day: 6, open: "10:00", close: "18:00", closed: true },
];

// ---------------------------------------------------------------- open

test("mid-morning on a weekday is open", () => {
  // Tuesday 1 September, 11:00 London (10:00Z under BST).
  assert.equal(isOutOfHours(new Date("2026-09-01T10:00:00Z"), HOURS, TZ), false);
});

test("the moment it opens counts as open", () => {
  assert.equal(isOutOfHours(new Date("2026-09-01T09:00:00Z"), HOURS, TZ), false);
});

// ---------------------------------------------------------------- shut

test("nine in the evening is out of hours", () => {
  // The enquiry this whole product exists to catch.
  assert.equal(isOutOfHours(new Date("2026-09-01T20:00:00Z"), HOURS, TZ), true);
});

test("before opening is out of hours", () => {
  assert.equal(isOutOfHours(new Date("2026-09-01T06:00:00Z"), HOURS, TZ), true);
});

test("the moment it closes counts as shut", () => {
  // 18:00 London is 17:00Z under BST. Closing time is not still open.
  assert.equal(isOutOfHours(new Date("2026-09-01T17:00:00Z"), HOURS, TZ), true);
});

test("a closed day is out of hours all day", () => {
  // Sunday 6 September, midday.
  assert.equal(isOutOfHours(new Date("2026-09-06T11:00:00Z"), HOURS, TZ), true);
});

// ---------------------------------------------------------------- timezone

test("British Summer Time does not shift the boundary", () => {
  // 09:30Z is 10:30 London in summer — open. The same instant in winter would
  // be 09:30 London, which is shut. Getting this wrong would misattribute
  // months of enquiries as recovered revenue.
  assert.equal(isOutOfHours(new Date("2026-09-01T09:30:00Z"), HOURS, TZ), false);
  assert.equal(isOutOfHours(new Date("2026-12-01T09:30:00Z"), HOURS, TZ), true);
});

// ---------------------------------------------------------------- the week

test("the week runs Monday to Monday and excludes this one", () => {
  // Wednesday 2 September 2026.
  const { from, to } = lastWeek(new Date("2026-09-02T12:00:00Z"), TZ);
  assert.equal(from.toISOString().slice(0, 10), "2026-08-24"); // Monday before
  assert.equal(to.toISOString().slice(0, 10), "2026-08-31"); // this Monday
  assert.equal((to.getTime() - from.getTime()) / 86400000, 7);
});

test("on a Monday, the report covers the week just gone", () => {
  const { from, to } = lastWeek(new Date("2026-08-31T09:00:00Z"), TZ);
  assert.equal(from.toISOString().slice(0, 10), "2026-08-24");
  assert.equal(to.toISOString().slice(0, 10), "2026-08-31");
});
