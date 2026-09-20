import { test } from "node:test";
import assert from "node:assert/strict";
import { longestSession } from "./longestSession.ts";
import { verticalPack } from "../verticals.ts";

const band = (
  minutes: number | null,
  consult = false,
  hoursLow = 0,
): { duration_minutes: number | null; hours_low: number; requires_consultation: boolean } => ({
  duration_minutes: minutes,
  hours_low: hoursLow,
  requires_consultation: consult,
});

/*
 * The fault this was written for.
 *
 * Brightwork Plastering's own list has "Skim one room", eight hours, bookable
 * straight off. The limit on one appointment was six, and a job over the limit
 * is not refused: durationFor books it for the limit instead. So it went in the
 * diary as six hours, the diary showed him free at three while he was still on
 * the ceiling, and the customer had been given a finishing time that was never
 * true.
 *
 * It came from the seed pack, so every plasterer was born with it.
 */
test("a trade whose ordinary job is longer than six hours gets a longer day", () => {
  assert.equal(longestSession([band(120), band(480), band(240)]), 480);
});

test("a trade whose jobs all fit keeps the six hours everybody had", () => {
  assert.equal(longestSession([band(45), band(120), band(180)]), 360);
});

/*
 * A job marked "consult first" is booked as a consultation whatever its length,
 * so it says nothing about how long a day is. Counting it would give every
 * electrician a sixteen-hour appointment limit on the strength of a rewire that
 * is never booked as one appointment.
 */
test("a job that is only ever a consultation does not stretch the day", () => {
  assert.equal(longestSession([band(60), band(960, true)]), 360);
});

test("a band priced by the hour counts the low end, which is what gets booked", () => {
  assert.equal(longestSession([band(null, false, 9)]), 540);
});

test("an empty list is the six hours, not nothing", () => {
  assert.equal(longestSession([]), 360);
});

test("nothing is given a day longer than a day", () => {
  assert.equal(longestSession([band(3000)]), 1440);
});

/*
 * And the packs themselves, which is where this started. A trade shipped with a
 * list its own appointment limit cannot hold is a trade that mis-books on the
 * first day, and there is no screen anywhere that would say so.
 */
test("no trade is shipped with a job its own day cannot hold", () => {
  for (const id of ["plasterer", "electrician", "cleaner", "salon", "tattoo", "garage"]) {
    const pack = verticalPack(id);
    const limit = longestSession(pack.bands);
    for (const b of pack.bands) {
      if (b.requires_consultation) continue;
      const needs = b.duration_minutes ?? Math.round((b.hours_low ?? 0) * 60);
      assert.ok(
        needs <= limit,
        `${id}: "${b.size_label}" needs ${needs} minutes and the day is ${limit}`,
      );
    }
  }
});
