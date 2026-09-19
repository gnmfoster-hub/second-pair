import { test } from "node:test";
import assert from "node:assert/strict";
import { whyNotSend } from "./whyNotSend.ts";

const now = new Date("2026-09-20T09:00:00.000Z");
const tomorrow = "2026-09-21T09:00:00.000Z";
const yesterday = "2026-09-19T09:00:00.000Z";

test("a live appointment still to come is reminded about", () => {
  assert.equal(whyNotSend({ starts_at: tomorrow, cancelled_at: null }, true, now), null);
});

/*
 * The net under the cancellation path.
 *
 * Cancelling marks the booking cancelled and then drops its reminders, and the
 * drop is allowed to fail because of this check. If this ever stops refusing a
 * cancelled booking, a customer is told to turn up to something that is not
 * happening — in the business's name.
 */
test("a cancelled appointment is never reminded about", () => {
  const why = whyNotSend(
    { starts_at: tomorrow, cancelled_at: "2026-09-20T08:00:00.000Z" },
    true,
    now,
  );
  assert.match(why ?? "", /cancelled/i);
});

test("an appointment that has already happened is not reminded about", () => {
  assert.match(whyNotSend({ starts_at: yesterday, cancelled_at: null }, true, now) ?? "", /already/i);
});

test("an appointment that is not there any more is not reminded about", () => {
  assert.ok(whyNotSend(null, true, now));
  assert.ok(whyNotSend(undefined, true, now));
});

test("a reminder whose template has gone is not sent", () => {
  assert.match(
    whyNotSend({ starts_at: tomorrow, cancelled_at: null }, false, now) ?? "",
    /gone/i,
  );
});

/*
 * Date.parse returns NaN and every comparison with NaN is false, so a booking
 * whose time could not be read looked like one comfortably in the future.
 */
test("an unreadable time is a reason not to send, not a reason to send", () => {
  assert.ok(whyNotSend({ starts_at: "not a date", cancelled_at: null }, true, now));
  assert.ok(whyNotSend({ starts_at: "", cancelled_at: null }, true, now));
});

test("cancelled beats every other reason, so the row says the true one", () => {
  const why = whyNotSend({ starts_at: yesterday, cancelled_at: "2026-09-01T00:00:00Z" }, false, now);
  assert.match(why ?? "", /cancelled/i);
});

// The boundary: an appointment starting this very second has started.
test("an appointment starting now is not reminded about", () => {
  assert.ok(whyNotSend({ starts_at: now.toISOString(), cancelled_at: null }, true, now));
});
