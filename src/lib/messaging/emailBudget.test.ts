import { test } from "node:test";
import assert from "node:assert/strict";
import { tooMuchEmail, sinceMidnight, ORDINARY_EMAIL } from "./emailBudget.ts";

test("an ordinary day answers everything", () => {
  assert.equal(tooMuchEmail(0), null);
  assert.equal(tooMuchEmail(1), null);
  assert.equal(tooMuchEmail(39), null);
});

test("the fortieth is the last one answered", () => {
  assert.equal(tooMuchEmail(39), null);
  assert.ok(tooMuchEmail(40));
});

test("and past it, the reason is one somebody can act on", () => {
  const why = tooMuchEmail(40);
  assert.match(why ?? "", /already answered 40 emails for you today/);
  assert.match(why ?? "", /waiting here for a person/);
});

test("the ceiling is a number somebody can change", () => {
  assert.ok(tooMuchEmail(5, { perDay: 5 }));
  assert.equal(tooMuchEmail(4, { perDay: 5 }), null);
  assert.equal(ORDINARY_EMAIL.perDay, 40);
});

test("midnight is the start of today, not now", () => {
  const at = sinceMidnight(new Date("2026-09-14T17:42:11.000Z"));
  assert.equal(at, "2026-09-14T00:00:00.000Z");
});

/*
 * A window that moves with the clocks is one more thing to be wrong about at
 * two in the morning in March. The ceiling bounds spending; it does not
 * describe anybody's working day.
 */
test("and does not move with British Summer Time", () => {
  assert.equal(sinceMidnight(new Date("2026-06-30T23:30:00.000Z")), "2026-06-30T00:00:00.000Z");
});
