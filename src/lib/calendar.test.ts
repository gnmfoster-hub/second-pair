import { test } from "node:test";
import assert from "node:assert/strict";
import { startOfWeek, addDays, isoDate, parseIsoDate } from "./calendar.ts";

/**
 * The date arithmetic the diary is laid out on.
 *
 * Every view starts by working out which days it is showing. If a week starts
 * on the wrong day the whole grid is shifted by one and every appointment
 * appears under the wrong heading — which looks like a data problem and is not.
 */

// 1 September 2026 is a Tuesday.
const tuesday = new Date(2026, 8, 1);

test("a week starts on Monday, as a UK working week reads", () => {
  assert.equal(isoDate(startOfWeek(tuesday)), "2026-08-31");
});

test("Monday is already the start of its own week", () => {
  const monday = new Date(2026, 7, 31);
  assert.equal(isoDate(startOfWeek(monday)), "2026-08-31");
});

test("Sunday belongs to the week that began six days earlier", () => {
  // The off-by-one that a Sunday-first implementation gets wrong, and the only
  // day where the two disagree by a whole week.
  const sunday = new Date(2026, 8, 6);
  assert.equal(isoDate(startOfWeek(sunday)), "2026-08-31");
});

test("it returns the very start of that day", () => {
  const start = startOfWeek(tuesday);
  assert.equal(start.getHours(), 0);
  assert.equal(start.getMinutes(), 0);
  assert.equal(start.getSeconds(), 0);
  assert.equal(start.getMilliseconds(), 0);
});

test("it does not modify the date it was given", () => {
  const original = new Date(2026, 8, 1, 14, 30);
  startOfWeek(original);
  assert.equal(original.getDate(), 1, "startOfWeek mutated its argument");
  assert.equal(original.getHours(), 14);
});

// ------------------------------------------------------------------ adding

test("adding days crosses a month end", () => {
  assert.equal(isoDate(addDays(new Date(2026, 7, 30), 3)), "2026-09-02");
});

test("adding days crosses a year end", () => {
  assert.equal(isoDate(addDays(new Date(2026, 11, 30), 3)), "2027-01-02");
});

test("going backwards works too", () => {
  assert.equal(isoDate(addDays(new Date(2026, 8, 2), -3)), "2026-08-30");
});

test("adding does not modify the date it was given", () => {
  const original = new Date(2026, 8, 1);
  addDays(original, 5);
  assert.equal(original.getDate(), 1, "addDays mutated its argument");
});

test("it survives a clock change without losing a day", () => {
  // 29 March 2026 is when BST begins. A naive +86,400,000ms would land at 01:00
  // on the wrong day; using setDate does not.
  assert.equal(isoDate(addDays(new Date(2026, 2, 28), 1)), "2026-03-29");
  assert.equal(isoDate(addDays(new Date(2026, 2, 29), 1)), "2026-03-30");
  // And the October change, going the other way.
  assert.equal(isoDate(addDays(new Date(2026, 9, 24), 1)), "2026-10-25");
  assert.equal(isoDate(addDays(new Date(2026, 9, 25), 1)), "2026-10-26");
});

// ------------------------------------------------------------- to and from text

test("a date becomes yyyy-mm-dd with both digits", () => {
  assert.equal(isoDate(new Date(2026, 0, 5)), "2026-01-05");
});

test("it uses the day somebody means, not the UTC one", () => {
  // Late evening local is already tomorrow in UTC. The URL must say the day the
  // person is looking at.
  assert.equal(isoDate(new Date(2026, 8, 1, 23, 30)), "2026-09-01");
});

test("text becomes the same date back", () => {
  assert.equal(isoDate(parseIsoDate("2026-09-01")), "2026-09-01");
});

test("nonsense in the URL falls back to today rather than throwing", () => {
  // These come from a query string anybody can edit.
  for (const bad of ["", undefined, "not-a-date", "2026-13-45", "20260901"]) {
    const out = parseIsoDate(bad as string | undefined);
    assert.ok(out instanceof Date && !Number.isNaN(out.getTime()), String(bad));
  }
});

// ---------------------------------------- the rows the month view is built from

test("a month lays out as whole weeks, Monday to Sunday", () => {
  // Exactly how the month view builds its grid. September 2026 begins on a
  // Tuesday and ends on a Wednesday, so it needs the tail of August and the
  // head of October to make rectangular rows.
  const anchor = new Date(2026, 8, 1);
  const first = startOfWeek(new Date(Date.UTC(anchor.getFullYear(), anchor.getMonth(), 1, 12)));
  const last = new Date(Date.UTC(anchor.getFullYear(), anchor.getMonth() + 1, 0, 12));
  const end = addDays(startOfWeek(last), 7);

  const weeks: string[][] = [];
  for (let cursor = new Date(first); cursor < end; cursor = addDays(cursor, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => isoDate(addDays(cursor, i))));
  }

  assert.equal(weeks[0][0], "2026-08-31", "the grid should open on a Monday");
  assert.equal(weeks[0][1], "2026-09-01", "the first of the month is second in the row");
  assert.equal(weeks.at(-1)?.at(-1), "2026-10-04", "and close on a Sunday");
  assert.ok(weeks.every((w) => w.length === 7), "every row is a full week");
  assert.equal(weeks.length, 5);

  // Every day of September appears exactly once.
  const flat = weeks.flat();
  for (let day = 1; day <= 30; day++) {
    const key = `2026-09-${String(day).padStart(2, "0")}`;
    assert.equal(flat.filter((d) => d === key).length, 1, key);
  }
});

test("a month that starts on a Monday needs no days before it", () => {
  // June 2026 begins on a Monday — the case where an off-by-one would show a
  // whole empty week at the top.
  const anchor = new Date(2026, 5, 1);
  const first = startOfWeek(new Date(Date.UTC(anchor.getFullYear(), anchor.getMonth(), 1, 12)));
  assert.equal(isoDate(first), "2026-06-01");
});
