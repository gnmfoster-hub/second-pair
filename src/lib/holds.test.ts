import { test } from "node:test";
import assert from "node:assert/strict";
import { holdOn, holdLeft, holdMeans, holdShort } from "./holds.ts";

const NOW = Date.parse("2026-09-25T12:00:00Z");
const inMinutes = (m: number) => new Date(NOW + m * 60_000).toISOString();

/* Almost every row in a diary is not a hold, so null has to be the easy case. */
test("anything that is not a live hold is nothing to draw", () => {
  assert.equal(holdOn(null, "unpaid", NOW), null);
  assert.equal(holdOn(undefined, "unpaid", NOW), null);
  assert.equal(holdOn("not a date", "unpaid", NOW), null);
});

/*
 * The money is the fact that matters. Clearing held_until is a second write
 * that can fail, so a paid booking that still carries one is paid.
 */
test("a paid deposit is not a hold, whatever the column says", () => {
  assert.equal(holdOn(inMinutes(20), "paid", NOW), null);
  assert.equal(holdOn(inMinutes(20), "refunded", NOW), null);
});

test("it counts what is left, in whole minutes", () => {
  assert.equal(holdOn(inMinutes(45), "link_sent", NOW)?.minutesLeft, 45);
  assert.equal(holdOn(inMinutes(45.9), "link_sent", NOW)?.minutesLeft, 45);
});

test("under half an hour is worth saying loudly", () => {
  assert.equal(holdOn(inMinutes(31), "unpaid", NOW)?.soon, false);
  assert.equal(holdOn(inMinutes(30), "unpaid", NOW)?.soon, true);
  assert.equal(holdOn(inMinutes(2), "unpaid", NOW)?.soon, true);
});

/*
 * The gap between the hold running out and the sweep cancelling it is real —
 * the sweep runs on a schedule GitHub throttles — so a lapsed hold is a state
 * somebody will see.
 */
test("a hold that has run out says so rather than counting backwards", () => {
  const gone = holdOn(inMinutes(-5), "link_sent", NOW);
  assert.equal(gone?.lapsed, true);
  assert.equal(gone?.minutesLeft, 0);
  assert.match(holdLeft(gone!), /run out/);
  assert.match(holdMeans(gone!), /about to go back/);
});

test("the time left is said the way somebody would say it", () => {
  assert.equal(holdLeft(holdOn(inMinutes(18), "unpaid", NOW)!), "18m left to pay");
  assert.equal(holdLeft(holdOn(inMinutes(59), "unpaid", NOW)!), "59m left to pay");
  assert.equal(holdLeft(holdOn(inMinutes(62), "unpaid", NOW)!), "an hour left to pay");
  assert.equal(holdLeft(holdOn(inMinutes(200), "unpaid", NOW)!), "3 hours left to pay");
});

/*
 * "Held until 4:15" is a fact somebody has to work out the meaning of. The
 * meaning is that the slot goes back.
 */
test("the dialog says the consequence, not the timestamp", () => {
  const out = holdMeans(holdOn(inMinutes(20), "link_sent", NOW)!);
  assert.match(out, /20m left to pay/);
  assert.match(out, /goes back/);
});

/*
 * "179m" is technically the truth and nobody reads it as three hours.
 */
test("the badge switches to hours before the number gets silly", () => {
  assert.equal(holdShort(holdOn(inMinutes(18), "unpaid", NOW)!), "18m");
  assert.equal(holdShort(holdOn(inMinutes(59), "unpaid", NOW)!), "59m");
  assert.equal(holdShort(holdOn(inMinutes(179), "unpaid", NOW)!), "3h");
  assert.equal(holdShort(holdOn(inMinutes(-1), "unpaid", NOW)!), "going");
});
