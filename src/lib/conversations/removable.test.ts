import { test } from "node:test";
import assert from "node:assert/strict";
import { canRemove } from "./removable.ts";

/**
 * The guard on deleting a thread.
 *
 * A conversation cascades to its enquiry, an enquiry to its bookings, and a
 * booking to its reminders — so deleting a thread that has an appointment on
 * it takes the appointment out of the diary and the money out of the month's
 * takings, silently. That fault has already been through this codebase once,
 * in the erasure flow. These are here so it cannot come back.
 */

test("junk with nothing behind it goes", () => {
  assert.deepEqual(canRemove([]), { ok: true });
});

test("a live appointment stops it", () => {
  const verdict = canRemove([{ starts_at: "2027-03-11T10:00:00.000Z", cancelled_at: null }]);
  assert.equal(verdict.ok, false);
});

/*
 * Named, not just refused. Somebody looking at what seems to be spam needs to
 * know which appointment they nearly deleted, or they will assume the refusal
 * is a bug and go round it.
 */
test("it says which appointment, in the business's own timezone", () => {
  const verdict = canRemove(
    [{ starts_at: "2027-07-15T09:00:00.000Z", cancelled_at: null }],
    "Europe/London",
  );
  assert.equal(verdict.ok, false);
  if (verdict.ok) return;
  // 09:00 UTC in July is ten o'clock in London. Told nine, somebody would go
  // looking in the diary for an appointment that is not there at that time.
  assert.match(verdict.because, /10:00/);
  assert.match(verdict.because, /Thursday/);
});

test("a cancelled appointment does not stop it", () => {
  const verdict = canRemove([
    { starts_at: "2027-03-11T10:00:00.000Z", cancelled_at: "2027-03-01T09:00:00.000Z" },
  ]);
  assert.deepEqual(verdict, { ok: true });
});

test("cancelled and live together still stops it", () => {
  const verdict = canRemove([
    { starts_at: "2027-03-11T10:00:00.000Z", cancelled_at: "2027-03-01T09:00:00.000Z" },
    { starts_at: "2027-03-12T14:00:00.000Z", cancelled_at: null },
  ]);
  assert.equal(verdict.ok, false);
});

test("several are counted, and the soonest is the one named", () => {
  const verdict = canRemove([
    { starts_at: "2027-03-20T10:00:00.000Z", cancelled_at: null },
    { starts_at: "2027-03-11T10:00:00.000Z", cancelled_at: null },
  ]);
  assert.equal(verdict.ok, false);
  if (verdict.ok) return;
  assert.match(verdict.because, /2 appointments/);
  assert.match(verdict.because, /11 March/);
});

/*
 * A row with an unreadable date is still a live booking. Letting it through
 * because the date could not be formatted would delete the very thing the
 * guard exists to protect.
 */
test("an unreadable date still blocks it", () => {
  const verdict = canRemove([{ starts_at: "not a date", cancelled_at: null }]);
  assert.equal(verdict.ok, false);
});
