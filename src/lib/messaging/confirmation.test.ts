import { test } from "node:test";
import assert from "node:assert/strict";
import { composeConfirmation } from "./confirmation.ts";

const base = {
  // 15:00 UTC in January is 15:00 in London; in July it is 16:00.
  startsAt: "2027-01-14T15:00:00Z",
  endsAt: "2027-01-14T17:00:00Z",
  type: "session",
  depositPence: 5000,
  contactName: "Priya Raman",
  artistName: "Sarah Nolan",
  studioName: "The Fold Hair",
  timezone: "Europe/London",
  cancellationPolicy: "48 hours' notice, or the deposit is kept.",
  bookingId: "abc-123",
};

// ------------------------------------------------------------- what it says

test("it greets them by their first name", () => {
  const { text } = composeConfirmation(base);
  assert.match(text, /^Hello Priya,/);
});

test("it names the person they are seeing, not just the shop", () => {
  const { text } = composeConfirmation(base);
  assert.match(text, /booked in with Sarah Nolan/);
});

test("with nobody named, it falls back to the business", () => {
  const { text } = composeConfirmation({ ...base, artistName: null });
  assert.match(text, /booked in with The Fold Hair/);
});

test("the deposit says it comes off the total, which is the bit people ask", () => {
  const { text } = composeConfirmation(base);
  assert.match(text, /£50/);
  assert.match(text, /comes off the total/);
});

test("no deposit, no mention of one", () => {
  // The cancellation policy may say the word, so this looks for the sentence
  // that would only be there if a deposit had actually been taken.
  const { text } = composeConfirmation({ ...base, depositPence: 0 });
  assert.doesNotMatch(text, /Your deposit of/);
});

test("the cancellation policy is included when there is one", () => {
  const { text } = composeConfirmation(base);
  assert.match(text, /48 hours/);
});

// ------------------------------------------------------------ British time

test("a winter appointment reads in GMT", () => {
  const { text, subject } = composeConfirmation(base);
  assert.match(text, /Thursday 14 January at 3:00 pm/);
  assert.match(subject, /3:00 pm/);
});

test("a summer appointment reads an hour later, because of BST", () => {
  const { text } = composeConfirmation({
    ...base,
    startsAt: "2027-07-15T15:00:00Z",
    endsAt: "2027-07-15T17:00:00Z",
  });
  // 15:00 UTC in July is 16:00 in London. Getting this wrong sends somebody
  // to a salon an hour early, which is the whole reason the timezone is
  // carried around rather than assumed.
  assert.match(text, /4:00 pm/);
});

test("a business in another timezone gets its own clock", () => {
  const { text } = composeConfirmation({ ...base, timezone: "Europe/Madrid" });
  assert.match(text, /4:00 pm/);
});

// --------------------------------------------------------- the calendar file

test("the appointment is attached as a real calendar entry", () => {
  const { calendar } = composeConfirmation(base);
  assert.match(calendar, /BEGIN:VCALENDAR/);
  assert.match(calendar, /BEGIN:VEVENT/);
  assert.match(calendar, /DTSTART:20270114T150000Z/);
  assert.match(calendar, /DTEND:20270114T170000Z/);
});

test("its id is stable, so sending twice updates rather than duplicates", () => {
  const a = composeConfirmation(base).calendar;
  const b = composeConfirmation(base).calendar;
  assert.match(a, /UID:booking-abc-123@second-pair\.com/);
  assert.equal(
    a.match(/UID:.*/)?.[0],
    b.match(/UID:.*/)?.[0],
  );
});

test("a consultation says so in the calendar entry", () => {
  const { calendar } = composeConfirmation({ ...base, type: "consultation" });
  assert.match(calendar, /DESCRIPTION:Consultation/);
});

/*
 * The most-sent customer-facing email in the product, which went out as four
 * lines of plain text until 16 October.
 */
test("it is drawn as well as written", () => {
  const { html, text } = composeConfirmation(base);
  assert.match(html, /<!doctype html>/i);
  assert.match(html, /You are booked in/);
  // The two things somebody opens this to check, as labelled rows.
  assert.match(html, /When<\/td>/);
  // And the words still go, because half the world reads mail as text.
  assert.match(text, /You are booked in with/);
});

test("the deposit is only mentioned when there is one", () => {
  // The shared fixture has one, so the negative case has to take it away.
  assert.doesNotMatch(composeConfirmation({ ...base, depositPence: 0 }).html, /Deposit/);
  assert.match(composeConfirmation({ ...base, depositPence: 2000 }).html, /£20 received/);
});

test("their cancellation policy comes through in their own words", () => {
  const { html } = composeConfirmation(base);
  assert.match(html, /If you need to cancel/);
  assert.match(html, /48 hours&#39; notice, or the deposit is kept\./);

  // And no block at all where a business has not written one.
  assert.doesNotMatch(
    composeConfirmation({ ...base, cancellationPolicy: null }).html,
    /If you need to cancel/,
  );
});

/*
 * The subject and the calendar entry both carried a long dash, and neither
 * could have been found by sweeping the database: they are built here.
 */
test("no long dash in the subject, the words, the drawing or the calendar", () => {
  const made = composeConfirmation({
    ...base,
    depositPence: 2000,
    cancellationPolicy: "Two days' notice please.",
  });
  for (const [what, value] of Object.entries(made)) {
    assert.doesNotMatch(String(value), /[\u2014\u2013]/, `${what} still has one`);
  }
});
