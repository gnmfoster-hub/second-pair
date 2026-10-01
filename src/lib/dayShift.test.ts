import { test } from "node:test";
import assert from "node:assert/strict";
import { dayShift, shiftDay } from "./dayShift.ts";

const LONDON = "Europe/London";

test("a booking moved on by one day is one day", () => {
  assert.equal(
    dayShift("2026-11-03T09:00:00Z", "2026-11-04T09:00:00Z", LONDON),
    1,
  );
});

test("only the time changing is no shift at all", () => {
  assert.equal(
    dayShift("2026-11-03T09:00:00Z", "2026-11-03T14:30:00Z", LONDON),
    0,
  );
});

test("moving it backwards is a negative shift", () => {
  assert.equal(
    dayShift("2026-11-10T09:00:00Z", "2026-11-03T09:00:00Z", LONDON),
    -7,
  );
});

/*
 * ── The clock change, which is why this is not a subtraction ─────────────────
 *
 * The clocks go back in Britain on 25 October 2026, so that day has twenty-five
 * hours in it. Dividing the difference in milliseconds by 86,400,000 gives 1.04
 * for a one-day move across it, and 7.04 for a week - rounding saves the small
 * ones and nothing saves a run that crosses two changes.
 */
test("a day is still one day when the clocks go back in the middle of it", () => {
  /* Saturday 24th 09:00 BST to Sunday 25th 09:00 GMT: one day, 25 hours apart. */
  assert.equal(
    dayShift("2026-10-24T08:00:00Z", "2026-10-25T09:00:00Z", LONDON),
    1,
  );
});

test("a week across the change is seven days, not seven and a bit", () => {
  assert.equal(
    dayShift("2026-10-20T08:00:00Z", "2026-10-27T09:00:00Z", LONDON),
    7,
  );
});

test("and the same going into summer time", () => {
  /* The clocks go forward on 29 March 2026; that day is 23 hours. */
  assert.equal(
    dayShift("2026-03-28T09:00:00Z", "2026-03-29T08:00:00Z", LONDON),
    1,
  );
});

/*
 * Read in the business's own zone, not the server's.
 *
 * The server runs on UTC. Late evening in London is already tomorrow in UTC for
 * half the year, and a booking at half past midnight is the previous evening by
 * the machine's clock - which is the fault that put every time on every screen
 * an hour out all summer.
 */
test("it counts the business's days, not the server's", () => {
  /* Both of these are the 3rd and the 4th in London, and the 2nd and 3rd in New York. */
  assert.equal(dayShift("2026-07-03T23:30:00Z", "2026-07-04T23:30:00Z", LONDON), 1);
  assert.equal(dayShift("2026-07-03T23:30:00Z", "2026-07-04T23:30:00Z", "America/New_York"), 1);
  /*
   * And the case that proves it is reading the right clock.
   *
   * 23:30 UTC on the 3rd is already half past midnight on the 4th in London, so
   * moving to ten in the morning on the 4th is the SAME day and no shift at all.
   * By the server's own UTC clock it would look like a day's move.
   *
   * My first version of this test asserted 1, which was the mistake the test was
   * written to catch, made in the test instead. The code was right.
   */
  assert.equal(dayShift("2026-07-03T23:30:00Z", "2026-07-04T10:00:00Z", LONDON), 0);
  /* Tokyo is further ahead still, so it is the same day there too. */
  assert.equal(dayShift("2026-07-03T23:30:00Z", "2026-07-04T10:00:00Z", "Asia/Tokyo"), 0);
  /* Where it genuinely is a day apart, both agree. */
  assert.equal(dayShift("2026-07-03T12:00:00Z", "2026-07-04T12:00:00Z", LONDON), 1);
  assert.equal(dayShift("2026-07-03T12:00:00Z", "2026-07-04T12:00:00Z", "Asia/Tokyo"), 1);
});

// ------------------------------------------------------------- shifting a day

test("a later occurrence moves by the same number of days", () => {
  assert.equal(shiftDay("2026-11-10T09:00:00Z", 1, LONDON), "2026-11-11");
  assert.equal(shiftDay("2026-11-10T09:00:00Z", 0, LONDON), "2026-11-10");
  assert.equal(shiftDay("2026-11-10T09:00:00Z", -3, LONDON), "2026-11-07");
});

test("shifting crosses a month and a year end", () => {
  assert.equal(shiftDay("2026-11-30T09:00:00Z", 1, LONDON), "2026-12-01");
  assert.equal(shiftDay("2026-12-31T09:00:00Z", 1, LONDON), "2027-01-01");
});

test("shifting across a clock change lands on the day asked for", () => {
  assert.equal(shiftDay("2026-10-24T08:00:00Z", 7, LONDON), "2026-10-31");
  assert.equal(shiftDay("2026-10-20T08:00:00Z", 7, LONDON), "2026-10-27");
});

/*
 * The whole point, as one sentence: a standing Tuesday moved to Wednesday takes
 * every later Tuesday with it, and they all land on Wednesdays.
 */
test("a standing Tuesday moved to Wednesday makes every later one a Wednesday", () => {
  const was = "2026-11-03T09:00:00Z"; // a Tuesday
  const now = "2026-11-04T09:00:00Z"; // the Wednesday
  const by = dayShift(was, now, LONDON);

  const laterTuesdays = ["2026-11-10T09:00:00Z", "2026-11-17T09:00:00Z", "2026-11-24T09:00:00Z"];
  const moved = laterTuesdays.map((t) => shiftDay(t, by, LONDON));

  assert.deepEqual(moved, ["2026-11-11", "2026-11-18", "2026-11-25"]);
  for (const day of moved) {
    assert.equal(new Date(`${day}T12:00:00Z`).getUTCDay(), 3, `${day} should be a Wednesday`);
  }
});
