import { test } from "node:test";
import assert from "node:assert/strict";
import { gapsFor, saidAloud, dayShape } from "./diaryGaps.ts";
import type { OpeningHours } from "./types.ts";

/** 72px an hour, which is what the grid uses. So 1.2px a minute. */
const H = 72;
const at = (hour: number, minute = 0) => ((hour * 60 + minute) / 60) * H;
const open: OpeningHours = { day: 1, open: "09:00", close: "17:00", closed: false };

const block = (from: number, to: number) => ({ top: at(from), height: at(to) - at(from) });

test("an empty open day is one long gap", () => {
  const [gap, ...rest] = gapsFor([], open, H);
  assert.equal(rest.length, 0);
  assert.equal(gap.minutes, 8 * 60);
  assert.equal(gap.top, at(9));
});

test("the space between two appointments is found", () => {
  const gaps = gapsFor([block(9, 10), block(13, 14)], open, H);
  // 10–13 and 14–17
  assert.deepEqual(
    gaps.map((g) => g.minutes),
    [180, 180],
  );
  assert.equal(gaps[0].top, at(10));
});

test("nothing before opening or after closing is offered", () => {
  const gaps = gapsFor([block(9, 17)], open, H);
  assert.deepEqual(gaps, []);
});

test("a day that runs past closing is clipped, not extended", () => {
  // An appointment overrunning into the evening must not create an
  // after-hours gap behind it.
  const gaps = gapsFor([block(9, 12)], { ...open, close: "13:00" }, H);
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].minutes, 60);
});

// --------------------------------------------- the mistake it must never make

test("overlapping appointments do not invent a gap between them", () => {
  // Two people side by side from 10 to 12. Naively walking the list would see
  // 10–12 then 10–12 and report a gap where somebody is working.
  const gaps = gapsFor([block(10, 12), block(10, 12)], open, H);
  assert.deepEqual(
    gaps.map((g) => g.minutes),
    [60, 300],
  );
});

test("a chain of touching appointments is solid", () => {
  const gaps = gapsFor([block(9, 11), block(11, 13), block(13, 17)], open, H);
  assert.deepEqual(gaps, []);
});

test("an appointment inside another does not split it", () => {
  const gaps = gapsFor([block(9, 15), block(10, 11)], open, H);
  assert.deepEqual(
    gaps.map((g) => g.minutes),
    [120],
  );
});

test("appointments given out of order are still handled", () => {
  const gaps = gapsFor([block(14, 15), block(9, 10)], open, H);
  assert.deepEqual(
    gaps.map((g) => g.minutes),
    [240, 120],
  );
});

// ------------------------------------------------------------ what to ignore

test("a short crack is not offered as a gap", () => {
  // Half an hour between two jobs is not something to sell, and the label
  // would not fit anyway.
  const gaps = gapsFor([block(9, 12), block(12.5, 17)], open, H);
  assert.deepEqual(gaps, []);
});

test("a closed day has no gaps at all", () => {
  assert.deepEqual(gapsFor([], { ...open, closed: true }, H), []);
  assert.deepEqual(gapsFor([], undefined, H), []);
});

test("hours that do not parse describe no day", () => {
  assert.deepEqual(gapsFor([], { ...open, open: "", close: "" }, H), []);
  assert.deepEqual(gapsFor([], { ...open, open: "17:00", close: "09:00" }, H), []);
});

test("a zero-length entry cannot split the day", () => {
  const gaps = gapsFor([{ top: at(12), height: 0 }], open, H);
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].minutes, 8 * 60);
});

// -------------------------------------------------------------- how it reads

test("gaps are said the way somebody would say them", () => {
  assert.equal(saidAloud(45), "45m");
  assert.equal(saidAloud(60), "1h");
  assert.equal(saidAloud(135), "2h 15m");
  assert.equal(saidAloud(480), "8h");
});

// ------------------------------------------------------------ the day's shape

test("an empty day is one free run, edge to edge", () => {
  const shape = dayShape([], open, H);
  assert.deepEqual(shape, [{ from: 0, to: 100, busy: false }]);
});

test("a full day is one busy run", () => {
  const shape = dayShape([block(9, 17)], open, H);
  assert.deepEqual(shape, [{ from: 0, to: 100, busy: true }]);
});

test("a morning job reads as busy first, then free", () => {
  // 9-11 of a 9-17 day is the first quarter.
  const shape = dayShape([block(9, 11)], open, H);
  assert.deepEqual(shape, [
    { from: 0, to: 25, busy: true },
    { from: 25, to: 100, busy: false },
  ]);
});

test("two days with the same percentage can have different shapes", () => {
  // The whole argument for this existing: both are two hours of eight.
  const solid = dayShape([block(9, 11)], open, H);
  const split = dayShape([block(9, 10), block(15, 16)], open, H);
  assert.notDeepEqual(solid, split);
  assert.equal(solid.filter((s) => s.busy).length, 1);
  assert.equal(split.filter((s) => s.busy).length, 2);
});

test("an appointment overrunning closing is clipped to the day", () => {
  const shape = dayShape([block(15, 20)], open, H);
  assert.equal(shape[shape.length - 1].to, 100);
  assert.equal(shape[shape.length - 1].busy, true);
});

test("overlapping appointments are one run, not two", () => {
  const shape = dayShape([block(10, 12), block(11, 13)], open, H);
  assert.equal(shape.filter((s) => s.busy).length, 1);
});

test("a closed day has no shape at all", () => {
  assert.deepEqual(dayShape([block(9, 11)], { ...open, closed: true }, H), []);
});

test("the runs always cover the whole day without gaps or overlaps", () => {
  const shape = dayShape([block(10, 11), block(13, 15)], open, H);
  assert.equal(shape[0].from, 0);
  assert.equal(shape[shape.length - 1].to, 100);
  for (let i = 1; i < shape.length; i++) {
    assert.equal(shape[i].from, shape[i - 1].to, "runs must meet exactly");
  }
});

// ------------------------------------------------------------- the whole week

import { weekShape, dayIn } from "./diaryGaps.ts";

/** Nine-to-five Monday to Friday, shut at the weekend. */
const openWeek: OpeningHours[] = [0, 1, 2, 3, 4, 5, 6].map((day) => ({
  day,
  open: "09:00",
  close: "17:00",
  closed: day === 0 || day === 6,
}));

// 2026-03-02 is a Monday. Times are UTC and the zone is London, which in early
// March is still GMT — so the wall clock and UTC agree.
const MON = "2026-03-02";
const WEEK = ["2026-03-02", "2026-03-03", "2026-03-04", "2026-03-05", "2026-03-06"];
const on = (date: string, from: string, to: string) => ({
  startsAt: `${date}T${from}:00.000Z`,
  endsAt: `${date}T${to}:00.000Z`,
});

test("a week with nothing in it is seven empty days", () => {
  const week = weekShape([], WEEK, openWeek, "Europe/London");
  assert.equal(week.length, 5);
  assert.deepEqual(week.map((d) => d.busyPercent), [0, 0, 0, 0, 0]);
});

test("each day is shaped from its own appointments, not the week's", () => {
  // Monday solid, Wednesday empty. The averaged figure would call both 50%.
  const week = weekShape(
    [on(MON, "09:00", "17:00"), on("2026-03-03", "09:00", "13:00")],
    WEEK,
    openWeek,
    "Europe/London",
  );
  assert.equal(week[0].busyPercent, 100);
  assert.equal(week[1].busyPercent, 50);
  assert.equal(week[2].busyPercent, 0);
});

test("a day is measured against its own opening hours", () => {
  // Half day Wednesday. Four hours booked is all of it, not half of eight.
  const hours = openWeek.map((h) => (h.day === 3 ? { ...h, close: "13:00" } : h));
  const week = weekShape([on("2026-03-04", "09:00", "13:00")], WEEK, hours, "Europe/London");
  assert.equal(week[2].busyPercent, 100);
});

test("a closed day has no shape and cannot be busy", () => {
  const shut = openWeek.map((h) => (h.day === 1 ? { ...h, closed: true } : h));
  const week = weekShape([on(MON, "09:00", "17:00")], WEEK, shut, "Europe/London");
  assert.deepEqual(week[0].shape, []);
  assert.equal(week[0].busyPercent, 0);
});

// ----------------------------------------- the mistake the merge nearly caused

test("two people working at once is twice the work, not the same work", () => {
  // Both booked 9–17. The strip merges them into one solid run, which is right
  // for the strip — but measuring that strip would call a full salon 100% with
  // one stylist and 100% with two, and it is the same page either way.
  const both = [on(MON, "09:00", "17:00"), on(MON, "09:00", "17:00")];
  const alone = weekShape(both, WEEK, openWeek, "Europe/London", 1);
  const paired = weekShape(both, WEEK, openWeek, "Europe/London", 2);

  assert.equal(paired[0].busyPercent, 100, "two people, both full, is a full day");
  assert.equal(alone[0].busyPercent, 100, "capped, not 200");

  // Now only one of the two is working: the same strip, half the room used.
  const half = weekShape([on(MON, "09:00", "17:00")], WEEK, openWeek, "Europe/London", 2);
  assert.equal(half[0].busyPercent, 50);
  assert.equal(
    half[0].shape.filter((s) => s.busy).length,
    1,
    "the strip still shows the day as worked",
  );
});

test("the strip merges overlapping people into one run", () => {
  const week = weekShape(
    [on(MON, "10:00", "12:00"), on(MON, "11:00", "13:00")],
    WEEK,
    openWeek,
    "Europe/London",
    2,
  );
  assert.equal(week[0].shape.filter((s) => s.busy).length, 1);
});

// ------------------------------------------------------------------ timezones

test("an appointment is filed under the day it is on where the business is", () => {
  // 23:30 UTC in June is half past midnight the next day in London, and it
  // belongs to the day the salon thinks it is.
  assert.equal(dayIn("2026-06-01T23:30:00.000Z", "Europe/London"), "2026-06-02");
  assert.equal(dayIn("2026-06-01T23:30:00.000Z", "UTC"), "2026-06-01");
});

test("a date is not shifted into the day before by the machine's own clock", () => {
  // The weekday is read from the date string, so a server in New York does not
  // decide that Monday is Sunday.
  const week = weekShape([], ["2026-03-02"], openWeek, "Europe/London");
  assert.equal(week[0].shape.length, 1, "Monday is a working day");
});

test("a zero-length or backwards appointment is ignored", () => {
  const week = weekShape(
    [on(MON, "10:00", "10:00"), on(MON, "14:00", "12:00")],
    WEEK,
    openWeek,
    "Europe/London",
  );
  assert.equal(week[0].busyPercent, 0);
});
