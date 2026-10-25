import { test } from "node:test";
import assert from "node:assert/strict";
import { whichBooking } from "./whichBooking.ts";

/* Jess's own, so the one that started this is the one in the tests. */
const NOW = Date.parse("2026-10-18T10:39:00Z");
const hers = { id: "jess", starts_at: "2026-10-31T13:00:00Z" };

test("one appointment and no time named is that appointment", () => {
  const got = whichBooking([hers], { now: NOW });
  assert.equal(got.ok && got.booking.id, "jess");
});

test("the time they named picks it out", () => {
  const got = whichBooking([hers], { which: "2026-10-31T13:00:00Z", now: NOW });
  assert.equal(got.ok && got.booking.id, "jess");
});

test("seconds on the row do not stop it matching", () => {
  const got = whichBooking([{ ...hers, starts_at: "2026-10-31T13:00:42Z" }], {
    which: "2026-10-31T13:00:00Z",
    now: NOW,
  });
  assert.equal(got.ok && got.booking.id, "jess");
});

/*
 * Somebody who misremembers their own hour still means their own appointment.
 * Safe because every reply says back the time it actually touched.
 */
test("a wrong hour against a single appointment still finds it", () => {
  const got = whichBooking([hers], { which: "2026-10-31T15:00:00Z", now: NOW });
  assert.equal(got.ok && got.booking.id, "jess");
});

test("nothing ahead of now is nothing to change", () => {
  const got = whichBooking([{ id: "old", starts_at: "2026-09-01T09:00:00Z" }], { now: NOW });
  assert.equal(got.ok, false);
  assert.match(!got.ok ? got.because : "", /nothing booked that has not already happened/);
  assert.equal(!got.ok && got.handToAPerson, false);
});

test("an appointment that has already started today is in the past", () => {
  const got = whichBooking([{ id: "earlier", starts_at: "2026-10-18T09:00:00Z" }], { now: NOW });
  assert.equal(got.ok, false);
});

/*
 * The expensive one. Two booked, neither named, so it must ask rather than
 * take the next one: a guess here cancels an appointment nobody mentioned.
 */
test("several booked and none named is a question, not a guess", () => {
  const got = whichBooking(
    [hers, { id: "later", starts_at: "2026-11-14T09:00:00Z" }],
    { now: NOW },
  );
  assert.equal(got.ok, false);
  assert.match(!got.ok ? got.because : "", /2 appointments booked, so ask which one/);
  assert.equal(!got.ok && got.handToAPerson, false);
});

test("several booked and one named takes the named one", () => {
  const got = whichBooking(
    [hers, { id: "later", starts_at: "2026-11-14T09:00:00Z" }],
    { which: "2026-11-14T09:00:00Z", now: NOW },
  );
  assert.equal(got.ok && got.booking.id, "later");
});

test("several booked and a time that matches none of them asks", () => {
  const got = whichBooking(
    [hers, { id: "later", starts_at: "2026-11-14T09:00:00Z" }],
    { which: "2026-12-01T09:00:00Z", now: NOW },
  );
  assert.equal(got.ok, false);
  assert.match(!got.ok ? got.because : "", /ask which one/);
});

test("a time that is not a time is treated as no time at all", () => {
  const got = whichBooking([hers], { which: "next Saturday", now: NOW });
  assert.equal(got.ok && got.booking.id, "jess");
});

/*
 * Karen's weekly clean. Cancelling "my Tuesday" could mean this Tuesday, the
 * rest of the year, or anything between, and emptying a diary by accident is
 * the worst thing in this file.
 */
test("a standing run goes to a person, both ends of it", () => {
  for (const row of [
    { ...hers, repeats: "weekly" },
    { ...hers, repeat_parent_id: "the-first-one" },
  ]) {
    const got = whichBooking([row], { now: NOW });
    assert.equal(got.ok, false);
    assert.equal(!got.ok && got.handToAPerson, true);
    assert.match(!got.ok ? got.because : "", /standing run/);
  }
});

test("a group booking goes to a person", () => {
  const got = whichBooking([{ ...hers, group_id: "the-hen-do" }], { now: NOW });
  assert.equal(got.ok, false);
  assert.equal(!got.ok && got.handToAPerson, true);
  assert.match(!got.ok ? got.because : "", /group booking/);
});

test("the earliest is taken when sorting is the only thing deciding", () => {
  const got = whichBooking(
    [{ id: "b", starts_at: "2026-11-14T09:00:00Z" }, { id: "a", starts_at: "2026-10-31T13:00:00Z" }],
    { which: "2026-10-31T13:00:00Z", now: NOW },
  );
  assert.equal(got.ok && got.booking.id, "a");
});

/* Giles's standing rule. This text reaches a customer through the assistant. */
test("no long dashes in anything it says", () => {
  for (const got of [
    whichBooking([], { now: NOW }),
    whichBooking([hers, { id: "later", starts_at: "2026-11-14T09:00:00Z" }], { now: NOW }),
    whichBooking([{ ...hers, repeats: "weekly" }], { now: NOW }),
    whichBooking([{ ...hers, group_id: "g" }], { now: NOW }),
  ]) {
    assert.doesNotMatch(!got.ok ? got.because : "", /[—–]/);
  }
});

/*
 * The database's own default, which no fixture written by hand carries.
 *
 * `repeats` is an enum, not null default 'none', so every ordinary booking in
 * the table holds the string "none". Testing it for truthiness made every
 * appointment ever made look like a standing run, and the assistant told a
 * customer on a demo that only a person could cancel her haircut. Nothing
 * here caught it, because a fixture leaves the field out and an empty field
 * is falsy. A live booking found it in one pass.
 */
test("repeats 'none' is a one-off, which is what the database writes", () => {
  const got = whichBooking([{ ...hers, repeats: "none" }], { now: NOW });
  assert.equal(got.ok && got.booking.id, "jess");
});

test("an empty repeat rule is also a one-off", () => {
  for (const repeats of ["", null, undefined]) {
    const got = whichBooking([{ ...hers, repeats }], { now: NOW });
    assert.equal(got.ok && got.booking.id, "jess", String(repeats));
  }
});

test("every real rule in the enum is still a standing run", () => {
  for (const repeats of ["daily", "weekdays", "weekly", "fortnightly", "monthly"]) {
    const got = whichBooking([{ ...hers, repeats }], { now: NOW });
    assert.equal(got.ok, false, repeats);
    assert.equal(!got.ok && got.handToAPerson, true, repeats);
  }
});

test("an occurrence of a run is one even where the rule says none", () => {
  const got = whichBooking([{ ...hers, repeats: "none", repeat_parent_id: "the-first" }], { now: NOW });
  assert.equal(got.ok, false);
  assert.equal(!got.ok && got.handToAPerson, true);
});

/*
 * What Giles found on Neat & Tidy on 25 October, which is the whole reason
 * the three branches below exist rather than one.
 *
 * He typed "can i cancel my booking", then "Giles test", then "28th", on the
 * website, with no email and no number. The conversation got a client record
 * of its own and his real appointment on the 28th sat on the record he made
 * in September, so nothing was found. He was told: "there's nothing booked in
 * under you, Giles". He had a booking.
 *
 * Telling somebody they have nothing booked when they have is the worst
 * answer in this file. They either turn up anyway or they do not turn up at
 * all, and both cost the business the appointment.
 */

/* One: they have one, and it is on the record but out of this conversation's
   reach. Say so, and get a person. */
test("an appointment out of reach is never reported as no appointment", () => {
  const got = whichBooking([], { now: NOW, outOfReach: 1, unproved: true });
  assert.equal(got.ok, false);
  assert.equal(!got.ok && got.handToAPerson, true);
  assert.match(!got.ok ? got.because : "", /DO have an appointment booked/);
  assert.match(!got.ok ? got.because : "", /Do not tell them they have nothing booked/);
});

/* Two: nothing here at all, on a channel that cannot identify them. We do
   not know, so we must not say. Ask for the thing that would tell us. */
test("a nameless website chat is asked for an address, not told it has none", () => {
  const got = whichBooking([], { now: NOW, unproved: true });
  assert.equal(got.ok, false);
  assert.match(!got.ok ? got.because : "", /does NOT mean they have nothing booked/);
  assert.match(!got.ok ? got.because : "", /email address or the phone number/);
  assert.match(!got.ok ? got.because : "", /save_contact/);
  assert.doesNotMatch(!got.ok ? got.because : "", /nothing booked that has not already happened/);
});

/* Three: an email or a text. The record is them, so an empty answer is true
   and may be said plainly. */
test("on a proved channel an empty diary is a fact and is stated", () => {
  const got = whichBooking([], { now: NOW });
  assert.equal(got.ok, false);
  assert.equal(!got.ok && got.handToAPerson, false);
  assert.match(!got.ok ? got.because : "", /nothing booked that has not already happened/);
});

/*
 * And where this conversation does hold their history, an empty answer is
 * about time rather than about identity, so asking for an address again would
 * be the assistant not listening.
 */
test("a past appointment in this very chat is not a stranger", () => {
  const got = whichBooking([{ id: "done", starts_at: "2026-09-01T09:00:00Z" }], {
    now: NOW,
    unproved: true,
  });
  assert.equal(got.ok, false);
  assert.match(!got.ok ? got.because : "", /nothing booked that has not already happened/);
  assert.doesNotMatch(!got.ok ? got.because : "", /email address or the phone number/);
});

test("something in reach is still just answered, whatever else exists", () => {
  const got = whichBooking([hers], { now: NOW, outOfReach: 2, unproved: true });
  assert.equal(got.ok && got.booking.id, "jess");
});
