import { test } from "node:test";
import assert from "node:assert/strict";
import { freeSlots, saidAsTime } from "./freeSlots.ts";

/** 9am to 6pm, in minutes from midnight. */
const DAY = { from: 9 * 60, to: 18 * 60 };
const at = (h: number, m = 0) => h * 60 + m;

test("an empty day is one long gap", () => {
  assert.deepEqual(freeSlots(DAY, [], 30), [{ from: at(9), to: at(18) }]);
});

test("a day with one appointment has a gap either side", () => {
  const free = freeSlots(DAY, [{ from: at(12), to: at(13) }], 30);
  assert.deepEqual(free, [
    { from: at(9), to: at(12) },
    { from: at(13), to: at(18) },
  ]);
});

/*
 * The whole point of the threshold. Ten minutes between a cut and a colour is
 * how a day is supposed to breathe, and a list that reports it buries the hour
 * and a half that actually means something.
 */
test("the breathing space between appointments is not a gap worth selling", () => {
  const free = freeSlots(
    DAY,
    [
      { from: at(9), to: at(11) },
      { from: at(11, 10), to: at(18) },
    ],
    30,
  );
  assert.deepEqual(free, []);
});

test("but the same ten minutes counts if you are selling ten-minute slots", () => {
  const free = freeSlots(
    DAY,
    [
      { from: at(9), to: at(11) },
      { from: at(11, 10), to: at(18) },
    ],
    10,
  );
  assert.deepEqual(free, [{ from: at(11), to: at(11, 10) }]);
});

test("a full day has nothing in it", () => {
  assert.deepEqual(freeSlots(DAY, [{ from: at(9), to: at(18) }], 30), []);
});

/*
 * A salon double-books a chair constantly, and a week's rows arrive in
 * whatever order the database felt like. Both are ordinary rather than
 * exceptional, so both are handled rather than assumed away.
 */
test("overlapping appointments do not invent a gap between them", () => {
  const free = freeSlots(
    DAY,
    [
      { from: at(10), to: at(14) },
      { from: at(11), to: at(12) },
      { from: at(13), to: at(16) },
    ],
    30,
  );
  assert.deepEqual(free, [
    { from: at(9), to: at(10) },
    { from: at(16), to: at(18) },
  ]);
});

test("appointments out of order are still read correctly", () => {
  const free = freeSlots(
    DAY,
    [
      { from: at(15), to: at(16) },
      { from: at(10), to: at(11) },
    ],
    45,
  );
  assert.deepEqual(free, [
    { from: at(9), to: at(10) },
    { from: at(11), to: at(15) },
    { from: at(16), to: at(18) },
  ]);
});

test("an appointment running past closing does not make the evening busy", () => {
  const free = freeSlots(DAY, [{ from: at(17), to: at(20) }], 30);
  assert.deepEqual(free, [{ from: at(9), to: at(17) }]);
});

test("something before opening belongs to another day", () => {
  const free = freeSlots(DAY, [{ from: at(7), to: at(8) }], 30);
  assert.deepEqual(free, [{ from: at(9), to: at(18) }]);
});

test("back to back leaves nothing between them", () => {
  const free = freeSlots(
    DAY,
    [
      { from: at(9), to: at(13) },
      { from: at(13), to: at(18) },
    ],
    15,
  );
  assert.deepEqual(free, []);
});

test("a closed day has no gaps at all", () => {
  assert.deepEqual(freeSlots({ from: at(9), to: at(9) }, [], 30), []);
});

test("times read the way somebody says them", () => {
  assert.equal(saidAsTime(at(9)), "9am");
  assert.equal(saidAsTime(at(13, 30)), "1:30pm");
  assert.equal(saidAsTime(at(12)), "12pm");
  assert.equal(saidAsTime(at(0)), "12am");
  assert.equal(saidAsTime(at(18)), "6pm");
});
