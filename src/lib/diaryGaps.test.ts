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
