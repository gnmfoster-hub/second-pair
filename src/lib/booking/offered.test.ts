import { test } from "node:test";
import assert from "node:assert/strict";
import { timesIn, offeredIn } from "./offered.ts";

/** Exactly the shape the slots tool writes. */
const RESULT = `Session with Ruth, 10 minutes.
Offer these and no others:
- Monday 14 September at 9:00 am  (starts_at: 2026-09-14T08:00:00.000Z)
- Monday 14 September at 1:30 pm  (starts_at: 2026-09-14T12:30:00.000Z)
Offer them in one short sentence.`;

/*
 * The whole reason this file exists. Anchoring on whitespace takes the closing
 * bracket with it, every timestamp then parses as invalid, and the exclusion
 * list is silently empty.
 */
test("a time comes back parseable, bracket and all", () => {
  const times = timesIn(RESULT);
  assert.deepEqual(times, [
    "2026-09-14T08:00:00.000Z",
    "2026-09-14T12:30:00.000Z",
  ]);
  for (const t of times) {
    assert.ok(Number.isFinite(Date.parse(t)), `${t} does not parse as a date`);
  }
});

test("a result with no times in it yields none", () => {
  assert.deepEqual(timesIn("Nothing free for Ruth in the next three weeks."), []);
});

test("only the slots tool's own results count", () => {
  const times = offeredIn([
    [{ name: "quote_estimate", result: "£150 to £250 (starts_at: nonsense)" }],
    [{ name: "get_available_slots", result: RESULT }],
  ]);
  assert.deepEqual(times, ["2026-09-14T08:00:00.000Z", "2026-09-14T12:30:00.000Z"]);
});

test("the same time offered twice is excluded once", () => {
  const times = offeredIn([
    [{ name: "get_available_slots", result: RESULT }],
    [{ name: "get_available_slots", result: RESULT }],
  ]);
  assert.equal(times.length, 2);
});

test("messages with no tool calls at all are fine", () => {
  assert.deepEqual(offeredIn([null, [], [undefined]]), []);
});
