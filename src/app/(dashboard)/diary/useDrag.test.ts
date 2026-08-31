import { test } from "node:test";
import assert from "node:assert/strict";
import { nextTimes, clockOf, lengthOf, SNAP_MINUTES } from "./useDrag.ts";

// 10:00–11:00, the shape of most appointments in here.
const TEN = 600;
const ELEVEN = 660;

// ------------------------------------------------------------------- moving

test("moving keeps the length", () => {
  const { startMinutes, endMinutes } = nextTimes("move", TEN, ELEVEN, 90);
  assert.equal(startMinutes, 690); // 11:30
  assert.equal(endMinutes, 750); // 12:30
});

test("moving upwards works as well as down", () => {
  const { startMinutes, endMinutes } = nextTimes("move", TEN, ELEVEN, -120);
  assert.equal(startMinutes, 480); // 08:00
  assert.equal(endMinutes, 540);
});

test("an entry cannot be dragged off the top of the day", () => {
  const { startMinutes, endMinutes } = nextTimes("move", TEN, ELEVEN, -900);
  assert.equal(startMinutes, 0);
  // Still an hour long, rather than squashed against midnight.
  assert.equal(endMinutes, 60);
});

test("an entry cannot be dragged off the bottom of the day", () => {
  const { startMinutes, endMinutes } = nextTimes("move", TEN, ELEVEN, 900);
  assert.equal(endMinutes, 1440);
  assert.equal(startMinutes, 1380);
});

// ----------------------------------------------------------------- resizing

test("resizing moves the end and leaves the start alone", () => {
  const { startMinutes, endMinutes } = nextTimes("resize", TEN, ELEVEN, 30);
  assert.equal(startMinutes, TEN);
  assert.equal(endMinutes, 690);
});

test("resizing cannot make something shorter than one step", () => {
  // Dragging the bottom edge far above the top would otherwise invert it.
  const { startMinutes, endMinutes } = nextTimes("resize", TEN, ELEVEN, -300);
  assert.equal(startMinutes, TEN);
  assert.equal(endMinutes, TEN + SNAP_MINUTES);
});

test("resizing cannot run past midnight", () => {
  const { endMinutes } = nextTimes("resize", 1380, 1440, 600);
  assert.equal(endMinutes, 1440);
});

// ----------------------------------------------------------------- creating

test("creating drags downwards from where it started", () => {
  const { startMinutes, endMinutes } = nextTimes("create", TEN, TEN, 120);
  assert.equal(startMinutes, TEN);
  assert.equal(endMinutes, 720); // two hours
});

test("creating can be dragged upwards", () => {
  // People do this constantly when the slot they want is above the pointer.
  const { startMinutes, endMinutes } = nextTimes("create", TEN, TEN, -90);
  assert.equal(startMinutes, 510); // 08:30
  assert.equal(endMinutes, TEN);
});

test("creating always makes something at least one step long", () => {
  const { startMinutes, endMinutes } = nextTimes("create", TEN, TEN, 0);
  assert.equal(endMinutes - startMinutes, SNAP_MINUTES);
});

// ------------------------------------------------------------------ display

test("times read as a person would say them", () => {
  assert.equal(clockOf(0), "12:00 am");
  assert.equal(clockOf(570), "9:30 am");
  assert.equal(clockOf(720), "12:00 pm");
  assert.equal(clockOf(825), "1:45 pm");
});

test("lengths drop the part that is zero", () => {
  assert.equal(lengthOf(45), "45m");
  assert.equal(lengthOf(60), "1h");
  assert.equal(lengthOf(90), "1h 30m");
  assert.equal(lengthOf(300), "5h");
});
