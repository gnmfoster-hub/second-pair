import { test } from "node:test";
import assert from "node:assert/strict";
import { mayChangeBookings, reachesWholeRecord } from "./mayChange.ts";

const ours = { booking_provider: "native" };

test("our own diary, and a business that has not said otherwise", () => {
  assert.equal(mayChangeBookings({}, ours), true);
});

/* The aware half of on-by-default. A business that says no is obeyed. */
test("a business that switched it off", () => {
  assert.equal(mayChangeBookings({ assistant_may_change_bookings: false }, ours), false);
});

test("switched on explicitly is the same as not switched off", () => {
  assert.equal(mayChangeBookings({ assistant_may_change_bookings: true }, ours), true);
});

/*
 * The window between a deploy and a migration run by hand. The column is not
 * there, so the field is undefined, and a feature that turns itself off for a
 * day is worse than one that was never on.
 */
test("undefined reads as yes, not as no", () => {
  assert.equal(mayChangeBookings({ assistant_may_change_bookings: undefined }, ours), true);
});

test("a person with no provider set is on our own diary", () => {
  assert.equal(mayChangeBookings({}, { booking_provider: null }), true);
  assert.equal(mayChangeBookings({}, {}), true);
});

/*
 * Somebody else's booking system. Fresha and the like publish a feed we read
 * and a page we cannot write to, so there is nothing here for us to change.
 */
test("a diary we only read is never changed", () => {
  for (const kind of ["ical_link", "link_only", "manual", "google"]) {
    assert.equal(mayChangeBookings({}, { booking_provider: kind }), false, kind);
  }
});

test("a provider nobody recognises is treated as the most cautious one", () => {
  assert.equal(mayChangeBookings({}, { booking_provider: "something_new" }), false);
});

test("nobody set up yet is a no, and does not throw", () => {
  assert.equal(mayChangeBookings({}, undefined), false);
});

/*
 * Whether this channel's own say-so reaches every appointment on the record.
 *
 * It lives in change.ts beside the reasoning, and is tested here because this
 * is the file about who is allowed to do what.
 *
 * The hole it closes: saveContact moves a conversation onto an existing
 * client record when somebody gives a number or an address already on file
 * and a first name that agrees. That is deliberate and good, and it means a
 * website visitor who types a real customer's number and first name is, to
 * anything downstream, that customer. So the website reaches this
 * conversation only, and the proved channels are listed rather than the
 * unproved ones, so a channel added later is strict until somebody decides.
 */
test("a website visitor is nobody in particular", () => {
  assert.equal(reachesWholeRecord("web"), false);
});

test("a channel keyed on something they had to hold reaches the record", () => {
  for (const channel of ["email", "sms", "whatsapp", "instagram", "messenger", "voice"]) {
    assert.equal(reachesWholeRecord(channel), true, channel);
  }
});

test("anything unrecognised, missing or new is strict", () => {
  for (const channel of ["", "widget", "carrier_pigeon", null, undefined]) {
    assert.equal(reachesWholeRecord(channel), false, String(channel));
  }
});
