import { test } from "node:test";
import assert from "node:assert/strict";
import { composeBookingAlert } from "./bookingAlert.ts";

const base = {
  // A Thursday in March, 10am London — GMT, so the stored UTC and the local
  // time agree and a wrong timezone would not show up here. There is a summer
  // case below for that.
  startsAt: "2027-03-11T10:00:00.000Z",
  minutes: 90,
  type: "session",
  contactName: "Jo Marsh",
  contactPhone: "07700 900321",
  contactEmail: "jo@example.com",
  artistName: "Dave Bone",
  studioName: "Living Canvas Tattoo",
  timezone: "Europe/London",
  depositPence: 0,
  depositPaid: false,
  conversationUrl: "https://www.second-pair.com/conversations/abc",
};

test("the title carries the day and time, because that is what gets read", () => {
  const a = composeBookingAlert(base);
  assert.match(a.title, /Thu/);
  assert.match(a.title, /11 Mar/);
  assert.match(a.title, /10:00/);
});

/*
 * The lock screen is read by whoever is stood next to them — the client in the
 * chair, somebody on the bus. Their customer's surname and mobile number are
 * not ours to put there.
 */
test("nothing private reaches the lock screen", () => {
  const a = composeBookingAlert(base);
  const shown = `${a.title} ${a.body}`;
  assert.match(a.body, /Jo/);
  assert.doesNotMatch(shown, /Marsh/);
  assert.doesNotMatch(shown, /900321/);
  assert.doesNotMatch(shown, /jo@example\.com/);
});

test("the email is the one that carries the details", () => {
  const a = composeBookingAlert(base);
  assert.match(a.emailText, /Jo Marsh/);
  assert.match(a.emailText, /07700 900321/);
  assert.match(a.emailText, /jo@example\.com/);
  assert.match(a.emailText, /Dave Bone/);
  assert.match(a.emailText, /90 minutes/);
  assert.match(a.emailText, /conversations\/abc/);
});

/*
 * The failure this is here to stop is a business ringing a customer to confirm
 * a booking the assistant already confirmed, which makes them look like the
 * left hand does not know what the right is doing.
 */
test("it says there is nothing for them to do", () => {
  const a = composeBookingAlert(base);
  assert.match(a.emailText, /already been told/i);
});

test("in summer the time is the one they will turn up at", () => {
  // 09:00 UTC in July is ten o'clock in London. A business told nine would
  // have somebody arrive an hour after they expected them.
  const a = composeBookingAlert({ ...base, startsAt: "2027-07-15T09:00:00.000Z" });
  assert.match(a.title, /10:00/);
  assert.match(a.emailText, /10:00/);
});

test("a booking with no name still says something", () => {
  const a = composeBookingAlert({
    ...base,
    contactName: null,
    contactPhone: null,
    contactEmail: null,
  });
  assert.match(a.body, /Someone/);
  assert.match(a.emailSubject, /Someone/);
  // No blank "Phone:" line with nothing after it.
  assert.doesNotMatch(a.emailText, /Phone:\s*$/m);
  assert.doesNotMatch(a.emailText, /Email:\s*$/m);
});

test("a deposit still owed says the slot is only held", () => {
  const a = composeBookingAlert({ ...base, depositPence: 5000, depositPaid: false });
  assert.match(a.emailText, /£50/);
  assert.match(a.emailText, /held/i);
});

test("a deposit paid says so and does not say held", () => {
  const a = composeBookingAlert({ ...base, depositPence: 5000, depositPaid: true });
  assert.match(a.emailText, /£50 paid/);
  assert.doesNotMatch(a.emailText, /held/i);
});

test("no deposit mentions no money at all", () => {
  const a = composeBookingAlert(base);
  assert.doesNotMatch(a.emailText, /deposit/i);
});

test("a consultation is called a consultation", () => {
  const a = composeBookingAlert({ ...base, type: "consultation" });
  assert.match(a.emailSubject, /consultation/i);
  assert.match(a.emailText, /a consultation/i);
});

/*
 * A one-person business has no interest in being told which of its one person
 * the booking is with, and "with Karen Foster" from Karen Foster's own
 * assistant reads as software that does not know who it is talking to.
 */
test("with nobody named, no dangling 'with'", () => {
  const a = composeBookingAlert({ ...base, artistName: null });
  assert.doesNotMatch(a.body, /with/);
  assert.doesNotMatch(a.emailText, /Who with/);
});
