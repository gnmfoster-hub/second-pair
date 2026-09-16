import { test } from "node:test";
import assert from "node:assert/strict";
import {
  regularInstants,
  howManyVisits,
  isRegularRule,
  timeIn,
  regularSummary,
} from "./regular.ts";

const LONDON = "Europe/London";

test("a weekly slot lands on the same day, a week apart", () => {
  const first = "2026-09-22T09:00:00.000Z"; // Tuesday, 10:00 in London (BST)
  const dates = regularInstants(first, "weekly", 4, LONDON);
  assert.equal(dates.length, 4);
  assert.deepEqual(dates, [
    "2026-09-22T09:00:00.000Z",
    "2026-09-29T09:00:00.000Z",
    "2026-10-06T09:00:00.000Z",
    "2026-10-13T09:00:00.000Z",
  ]);
});

/*
 * The whole reason this is not arithmetic on instants. British clocks go back
 * on 25 October 2026; a five o'clock lesson must stay at five o'clock.
 */
test("the clocks going back do not move the appointment", () => {
  const first = "2026-10-20T16:00:00.000Z"; // Tuesday 17:00 London, still BST
  const dates = regularInstants(first, "weekly", 3, LONDON);
  assert.deepEqual(dates, [
    "2026-10-20T16:00:00.000Z",
    "2026-10-27T17:00:00.000Z", // GMT now: same wall clock, different instant
    "2026-11-03T17:00:00.000Z",
  ]);
  for (const d of dates) assert.equal(timeIn(new Date(d), LONDON), "17:00");
});

test("fortnightly is two weeks, monthly is the same date next month", () => {
  assert.deepEqual(regularInstants("2026-09-22T09:00:00.000Z", "fortnightly", 3, LONDON), [
    "2026-09-22T09:00:00.000Z",
    "2026-10-06T09:00:00.000Z",
    "2026-10-20T09:00:00.000Z",
  ]);
  const monthly = regularInstants("2026-09-22T09:00:00.000Z", "monthly", 3, LONDON);
  assert.deepEqual(
    monthly.map((d) => d.slice(0, 10)),
    ["2026-09-22", "2026-10-22", "2026-11-22"],
  );
});

test("how many visits is clamped to something sane", () => {
  assert.equal(howManyVisits(undefined), 6);
  assert.equal(howManyVisits("four"), 6);
  assert.equal(howManyVisits(1), 2);
  assert.equal(howManyVisits(60), 12);
  assert.equal(howManyVisits(8), 8);
});

test("only the three rules a customer can ask for", () => {
  assert.equal(isRegularRule("weekly"), true);
  assert.equal(isRegularRule("fortnightly"), true);
  assert.equal(isRegularRule("monthly"), true);
  assert.equal(isRegularRule("daily"), false, "nobody has a cleaner every day");
  assert.equal(isRegularRule("none"), false);
  assert.equal(isRegularRule(undefined), false);
});

test("a rubbish time books nothing at all", () => {
  assert.deepEqual(regularInstants("not a date", "weekly", 4, LONDON), []);
});

test("what is said back names the gaps", () => {
  const all = regularSummary({
    rule: "fortnightly",
    made: ["a", "b", "c"],
    skipped: [],
    timezone: LONDON,
  });
  assert.match(all, /every two weeks/);
  assert.doesNotMatch(all, /could not/);

  const some = regularSummary({ rule: "weekly", made: ["a", "b"], skipped: ["c"], timezone: LONDON });
  assert.match(some, /could not be done/);

  const one = regularSummary({ rule: "weekly", made: ["a"], skipped: ["b", "c"], timezone: LONDON });
  assert.match(one, /Only the first/);
});
