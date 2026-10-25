import { test } from "node:test";
import assert from "node:assert/strict";
import { composeChangeAlert } from "./changeAlert.ts";

/* Jess's own appointment, so the one that started this is the one in here. */
const base = {
  was: "2026-10-31T13:00:00Z",
  contactName: "Jess Miller",
  contactPhone: null,
  contactEmail: "jessierosemiller@icloud.com",
  artistName: "Dave Bone",
  studioName: "Living Canvas Tattoo",
  timezone: "Europe/London",
  depositPence: 0,
  depositPaid: false,
  conversationUrl: "https://www.second-pair.com/conversations/abc",
};

test("a cancellation says what was lost, and when it was", () => {
  const a = composeChangeAlert({ ...base, what: "cancelled" });
  assert.match(a.emailSubject, /Cancelled by Jess Miller/);
  assert.match(a.emailText, /has cancelled their appointment/);
  assert.match(a.emailText, /Saturday 31 October at 1:00 pm/);
  assert.match(a.emailText, /Dave Bone/);
});

test("a move says both times, the old one first", () => {
  const a = composeChangeAlert({
    ...base,
    what: "moved",
    now: "2026-11-07T15:30:00Z",
  });
  assert.match(a.emailText, /It was:.*31 October/);
  assert.match(a.emailText, /It is now:.*7 November at 3:30 pm/);
  assert.ok(a.emailText.indexOf("It was:") < a.emailText.indexOf("It is now:"));
});

/*
 * Their diary is their own business and this is read by whoever is stood next
 * to them. The booking alert settled this rule; a change must not undo it.
 */
test("the lock screen gets a first name and no number", () => {
  const a = composeChangeAlert({
    ...base,
    what: "cancelled",
    contactPhone: "07780 575834",
  });
  assert.match(a.body, /^Jess cancelled/);
  assert.doesNotMatch(a.body, /Miller/);
  assert.doesNotMatch(a.body, /575834/);
  assert.doesNotMatch(a.title, /Jess/);
  /* And the email, which is private to them, carries everything. */
  assert.match(a.emailText, /Phone: 07780 575834/);
});

test("the title keeps the time, which is the half a phone cuts", () => {
  const a = composeChangeAlert({ ...base, what: "cancelled" });
  assert.match(a.title, /1:00 pm/);
  assert.ok(a.title.length <= 40, a.title);
});

/*
 * Money already taken. Said plainly and left with the business, because the
 * note to the customer promises nothing about a refund and these two must not
 * contradict each other.
 */
test("a deposit already paid is named, and no refund is promised", () => {
  const a = composeChangeAlert({
    ...base,
    what: "cancelled",
    depositPence: 2500,
    depositPaid: true,
  });
  assert.match(a.emailText, /deposit of £25 has been paid/);
  assert.match(a.emailText, /yours to decide/);
  assert.doesNotMatch(a.emailText, /refunded|we will refund|has been refunded/i);
});

test("an unpaid deposit is not mentioned at all", () => {
  const a = composeChangeAlert({ ...base, what: "cancelled", depositPence: 2500 });
  assert.doesNotMatch(a.emailText, /deposit/i);
});

test("a deposit survives a move, and is said so", () => {
  const a = composeChangeAlert({
    ...base,
    what: "moved",
    now: "2026-11-07T15:30:00Z",
    depositPence: 2500,
    depositPaid: true,
  });
  assert.match(a.emailText, /stays on the appointment/);
});

/*
 * The reflex this heads off is a business ringing a customer to confirm
 * something they have already been told, which undoes the point of the thing.
 */
test("it says the customer already knows", () => {
  for (const what of ["cancelled", "moved"] as const) {
    const a = composeChangeAlert({ ...base, what, now: "2026-11-07T15:30:00Z" });
    assert.match(a.emailText, /nothing you need to do/);
  }
});

test("somebody with no name on file is Someone, not blank", () => {
  const a = composeChangeAlert({ ...base, what: "cancelled", contactName: "  " });
  assert.match(a.emailSubject, /Cancelled by Someone/);
  assert.match(a.body, /^Someone cancelled/);
});

test("a move with no new time still reads as a sentence", () => {
  const a = composeChangeAlert({ ...base, what: "moved", now: null });
  assert.match(a.title, /Moved to another time/);
  assert.doesNotMatch(a.emailText, /undefined|null|NaN|Invalid/);
});

test("the clock is the business's own, not the server's", () => {
  const a = composeChangeAlert({ ...base, what: "cancelled", timezone: "Australia/Sydney" });
  assert.match(a.emailText, /Sunday 1 November/);
});

/* Giles's standing rule, on every wording in the file. */
test("no long dashes anywhere in either message", () => {
  for (const what of ["cancelled", "moved"] as const) {
    const a = composeChangeAlert({
      ...base,
      what,
      now: "2026-11-07T15:30:00Z",
      contactPhone: "07780 575834",
      depositPence: 2500,
      depositPaid: true,
    });
    for (const part of [a.title, a.body, a.emailSubject, a.emailText]) {
      assert.doesNotMatch(part, /[—–]/, part);
    }
  }
});
