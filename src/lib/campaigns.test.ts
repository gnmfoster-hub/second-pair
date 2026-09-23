import { test } from "node:test";
import assert from "node:assert/strict";
import { dueNow, wouldReach, campaignKey, type Campaign, type PastBooking } from "./campaigns.ts";

const NOW = new Date("2026-09-23T10:00:00Z");
const daysAgo = (n: number) =>
  new Date(NOW.getTime() - n * 86_400_000).toISOString();

const bought = { marketing_email_on: true, marketing_sms_on: true };

const agreed = {
  id: "c1",
  name: "Marie",
  email: "marie@example.com",
  phone: "+447700900123",
  marketing_email: true,
  marketing_sms: true,
};

const campaign: Campaign = {
  id: "k1",
  name: "Colour, six weeks on",
  body: "Time for another {{what}}?",
  channel: "email",
  after_service: "Colour",
  after_days: 42,
  enabled: true,
};

const booking = (over: Partial<PastBooking> = {}): PastBooking => ({
  id: "b1",
  title: "Colour",
  starts_at: daysAgo(42),
  contact: agreed,
  ...over,
});

test("somebody who had the job, the right number of days ago, is due", () => {
  const due = dueNow(bought, [campaign], [booking()], new Set(), NOW);
  assert.equal(due.length, 1);
  assert.equal(due[0].key, campaignKey("k1", "b1"));
});

test("too soon is not due", () => {
  assert.deepEqual(dueNow(bought, [campaign], [booking({ starts_at: daysAgo(41) })], new Set(), NOW), []);
});

/*
 * The one that cannot be taken back.
 *
 * Without an upper bound, switching a campaign on writes to everybody who has
 * ever been in — every colour for three years, all at once. A day either side
 * is generous when the sweep runs every few hours.
 */
test("long past is not due, so switching one on does not write to everybody ever", () => {
  assert.deepEqual(dueNow(bought, [campaign], [booking({ starts_at: daysAgo(300) })], new Set(), NOW), []);
  assert.deepEqual(dueNow(bought, [campaign], [booking({ starts_at: daysAgo(43.5) })], new Set(), NOW), []);
});

test("a different job does not match", () => {
  assert.deepEqual(dueNow(bought, [campaign], [booking({ title: "Blow dry" })], new Set(), NOW), []);
});

/* A title typed by hand is "colour" against a service called "Colour". */
test("the job name is matched loosely, because a person typed one of them", () => {
  const due = dueNow(bought, [campaign], [booking({ title: "  colour " })], new Set(), NOW);
  assert.equal(due.length, 1);
});

test("no job named means any appointment", () => {
  const any = { ...campaign, after_service: null };
  const due = dueNow(bought, [any], [booking({ title: "Anything at all" })], new Set(), NOW);
  assert.equal(due.length, 1);
});

/*
 * Time off and lunch breaks are rows in the same table and carry a contact
 * often enough that this is a real possibility, not a theoretical one.
 */
test("a campaign never follows a break or a block of time off", () => {
  assert.deepEqual(
    dueNow(bought, [{ ...campaign, after_service: null }], [booking({ category: "break" })], new Set(), NOW),
    [],
  );
});

test("a cancelled appointment is not followed", () => {
  assert.deepEqual(
    dueNow(bought, [campaign], [booking({ cancelled_at: daysAgo(40) })], new Set(), NOW),
    [],
  );
});

test("a switched-off campaign sends nothing", () => {
  assert.deepEqual(dueNow(bought, [{ ...campaign, enabled: false }], [booking()], new Set(), NOW), []);
});

/* Both halves, every time. */
test("the business must have bought the channel", () => {
  assert.deepEqual(dueNow({}, [campaign], [booking()], new Set(), NOW), []);
  const smsOnly = { marketing_email_on: false, marketing_sms_on: true };
  assert.deepEqual(dueNow(smsOnly, [campaign], [booking()], new Set(), NOW), []);
});

test("the person must have agreed, on that channel", () => {
  const notAgreed = { ...agreed, marketing_email: false };
  assert.deepEqual(dueNow(bought, [campaign], [booking({ contact: notAgreed })], new Set(), NOW), []);

  const noAddress = { ...agreed, email: null };
  assert.deepEqual(dueNow(bought, [campaign], [booking({ contact: noAddress })], new Set(), NOW), []);
});

test("something already sent is not sent again", () => {
  const sent = new Set([campaignKey("k1", "b1")]);
  assert.deepEqual(dueNow(bought, [campaign], [booking()], sent, NOW), []);
});

test("an unreadable date is skipped rather than crashing the sweep", () => {
  assert.deepEqual(dueNow(bought, [campaign], [booking({ starts_at: "not a date" })], new Set(), NOW), []);
});

/*
 * The number beside the send button, and why it is not the number of bookings:
 * somebody who has had four colours is one person to write to.
 */
test("the reach is people, not appointments", () => {
  const twice = [booking({ id: "b1" }), booking({ id: "b2" })];
  assert.equal(wouldReach(bought, campaign, twice), 1);
});

test("the reach counts only those who may lawfully be written to", () => {
  const mixed = [
    booking({ id: "b1" }),
    booking({ id: "b2", contact: { ...agreed, id: "c2", marketing_email: false } }),
  ];
  assert.equal(wouldReach(bought, campaign, mixed), 1);
  assert.equal(wouldReach({}, campaign, mixed), 0, "not bought: nobody");
});
