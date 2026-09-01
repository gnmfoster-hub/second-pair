import { test } from "node:test";
import assert from "node:assert/strict";
import { offsetAt, localParts, zonedToUtc } from "./tz.ts";

/**
 * The arithmetic that decides what time somebody turns up.
 *
 * Opening hours are wall-clock ("we open at ten"); the database is UTC. Get
 * the conversion wrong and, for the seven months of British Summer Time, every
 * appointment is an hour out — which does not fail loudly, it just means a
 * client arrives to a locked door.
 *
 * The dates below are real UK clock changes: BST began 29 March 2026 and ends
 * 25 October 2026.
 */

const HOUR = 3600_000;
const LONDON = "Europe/London";

// localParts deliberately returns only the date — the wall-clock time comes
// from the offset, which is the thing under test.
const localClock = (at: Date, tz = LONDON) => {
  const shifted = new Date(at.getTime() + offsetAt(at, tz));
  return { hour: shifted.getUTCHours(), minute: shifted.getUTCMinutes() };
};

// ------------------------------------------------------------------ offsets

test("London is on UTC in winter", () => {
  assert.equal(offsetAt(new Date("2026-01-15T12:00:00Z"), LONDON), 0);
});

test("London is an hour ahead in summer", () => {
  assert.equal(offsetAt(new Date("2026-07-15T12:00:00Z"), LONDON), HOUR);
});

test("the clocks go forward on the last Sunday in March", () => {
  // 00:59 UTC is still GMT; 01:00 UTC is when BST begins.
  assert.equal(offsetAt(new Date("2026-03-29T00:59:00Z"), LONDON), 0);
  assert.equal(offsetAt(new Date("2026-03-29T01:00:00Z"), LONDON), HOUR);
});

test("and back on the last Sunday in October", () => {
  assert.equal(offsetAt(new Date("2026-10-25T00:59:00Z"), LONDON), HOUR);
  assert.equal(offsetAt(new Date("2026-10-25T01:00:00Z"), LONDON), 0);
});

test("other timezones work too, for a business that is not here", () => {
  assert.equal(offsetAt(new Date("2026-01-15T12:00:00Z"), "Europe/Madrid"), HOUR);
  assert.equal(offsetAt(new Date("2026-07-15T12:00:00Z"), "Europe/Madrid"), 2 * HOUR);
  assert.equal(offsetAt(new Date("2026-07-15T12:00:00Z"), "UTC"), 0);
});

// -------------------------------------------------------------- local parts

test("it reads the wall clock, not the server's clock", () => {
  const p = localParts(new Date("2026-07-15T12:00:00Z"), LONDON);
  assert.equal(p.year, 2026);
  assert.equal(p.month, 7);
  assert.equal(p.day, 15);
});

test("late evening UTC is already tomorrow in summer", () => {
  // 23:30 UTC on the 15th is 00:30 on the 16th in London.
  const p = localParts(new Date("2026-07-15T23:30:00Z"), LONDON);
  assert.equal(p.day, 16);
});

test("weekday is the local one", () => {
  // 1 September 2026 is a Tuesday.
  assert.equal(localParts(new Date("2026-09-01T09:00:00Z"), LONDON).weekday, 2);
});

// ------------------------------------------------- wall clock back to an instant

test("ten in the morning in winter is ten UTC", () => {
  assert.equal(
    zonedToUtc(2026, 1, 15, 10 * 60, LONDON).toISOString(),
    "2026-01-15T10:00:00.000Z",
  );
});

test("ten in the morning in summer is nine UTC", () => {
  // The one that matters. Treating this as 10:00Z sends everybody an hour late.
  assert.equal(
    zonedToUtc(2026, 7, 15, 10 * 60, LONDON).toISOString(),
    "2026-07-15T09:00:00.000Z",
  );
});

test("it round-trips against the offset it is built on", () => {
  for (const [month, day] of [[1, 15], [3, 28], [3, 30], [6, 1], [10, 24], [10, 26], [12, 31]]) {
    const at = zonedToUtc(2026, month, day, 14 * 60 + 30, LONDON);
    const back = localParts(at, LONDON);
    const clock = localClock(at);
    assert.equal(back.day, day, `${day}/${month}`);
    assert.equal(clock.hour, 14, `${day}/${month} hour`);
    assert.equal(clock.minute, 30, `${day}/${month} minute`);
  }
});

test("an appointment on the day the clocks go forward still lands correctly", () => {
  // 29 March 2026, 10:00 local — after the change, so BST, so 09:00 UTC.
  const at = zonedToUtc(2026, 3, 29, 10 * 60, LONDON);
  assert.equal(at.toISOString(), "2026-03-29T09:00:00.000Z");
  assert.equal(localClock(at).hour, 10);
});

test("and on the day they go back", () => {
  // 25 October 2026, 10:00 local — after the change, so GMT.
  const at = zonedToUtc(2026, 10, 25, 10 * 60, LONDON);
  assert.equal(at.toISOString(), "2026-10-25T10:00:00.000Z");
  assert.equal(localClock(at).hour, 10);
});

test("a whole working day round-trips on both sides of a clock change", () => {
  for (const [month, day] of [[3, 29], [10, 25]]) {
    for (let hour = 8; hour <= 19; hour++) {
      const at = zonedToUtc(2026, month, day, hour * 60, LONDON);
      assert.equal(
        localClock(at).hour,
        hour,
        `${hour}:00 on ${day}/${month} came back as ${localClock(at).hour}`,
      );
    }
  }
});

test("midnight is the start of the right day", () => {
  const at = zonedToUtc(2026, 7, 15, 0, LONDON);
  assert.equal(localParts(at, LONDON).day, 15);
  assert.equal(localClock(at).hour, 0);
});
