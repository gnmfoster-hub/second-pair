import { test } from "node:test";
import assert from "node:assert/strict";
import { holdTillMorning } from "./holdTillMorning.ts";

const LONDON = "Europe/London";

/* October, so London is on summer time: 23:08 local is 22:08 UTC. */
const atNight = Date.parse("2026-10-15T22:08:00Z");
const atMidMorning = Date.parse("2026-10-15T09:00:00Z");

test("the one that actually happened", () => {
  // Julie Koch's reminder, due at four in the afternoon, found by a sweep
  // that had not run since. The appointment is the following afternoon.
  const held = holdTillMorning(atNight, "2026-10-16T15:00:00Z", LONDON, false);
  assert.equal(held, "Held until the morning rather than sent overnight.");
});

test("in the day it goes out", () => {
  assert.equal(holdTillMorning(atMidMorning, "2026-10-16T15:00:00Z", LONDON, false), null);
});

test("eight in the morning and eight at night are the edges", () => {
  const start = "2026-10-20T15:00:00Z";
  // 07:59 local, still night.
  assert.ok(holdTillMorning(Date.parse("2026-10-16T06:59:00Z"), start, LONDON, false));
  // 08:00 local, awake.
  assert.equal(holdTillMorning(Date.parse("2026-10-16T07:00:00Z"), start, LONDON, false), null);
  // 19:59 local, still awake.
  assert.equal(holdTillMorning(Date.parse("2026-10-16T18:59:00Z"), start, LONDON, false), null);
  // 20:00 local, night.
  assert.ok(holdTillMorning(Date.parse("2026-10-16T19:00:00Z"), start, LONDON, false));
});

test("a confirmation goes out whatever the hour", () => {
  // Somebody who booked at eleven at night is waiting to be told it worked.
  assert.equal(holdTillMorning(atNight, "2026-10-16T15:00:00Z", LONDON, true), null);
});

test("late beats never", () => {
  // An early appointment the next morning. Waiting for the morning means
  // waiting for a sweep that might not come until after it, so it goes now.
  assert.equal(holdTillMorning(atNight, "2026-10-16T08:00:00Z", LONDON, false), null);
  // Same night, same business, an appointment with room to spare.
  assert.ok(holdTillMorning(atNight, "2026-10-16T18:00:00Z", LONDON, false));
});

test("an appointment already gone is not this check's business", () => {
  // whyNotSend stops it; this one must not quietly claim it held it.
  assert.equal(holdTillMorning(atNight, "2026-10-14T15:00:00Z", LONDON, false), null);
});

test("an unreadable time is left to the check that handles it", () => {
  assert.equal(holdTillMorning(atNight, "not a date", LONDON, false), null);
});

test("night is night where the business is", () => {
  // 22:08 UTC is a quarter past eleven at night in London and a quarter past
  // six in the evening in New York, and the same reminder should go out there.
  const start = "2026-10-17T15:00:00Z";
  assert.ok(holdTillMorning(atNight, start, LONDON, false));
  assert.equal(holdTillMorning(atNight, start, "America/New_York", false), null);
});

test("the small hours wait for the morning, not for the evening before", () => {
  // Two in the morning is four hours from opening, not twenty.
  const held = holdTillMorning(Date.parse("2026-10-16T01:00:00Z"), "2026-10-16T19:00:00Z", LONDON, false);
  assert.ok(held);
  // And an appointment at ten that morning is too close to wait for.
  assert.equal(
    holdTillMorning(Date.parse("2026-10-16T01:00:00Z"), "2026-10-16T09:00:00Z", LONDON, false),
    null,
  );
});
