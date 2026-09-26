import { test } from "node:test";
import assert from "node:assert/strict";
import { ukTime, ukDay, ukStamp, ukAgo, londonDay } from "./whenUk.ts";

/*
 * ── The fault this exists for ───────────────────────────────────────────────
 *
 * These pages render on a server in UTC. British Summer Time runs from late
 * March to late October — most of the year a business is open — and an
 * unzoned formatter is an hour out for all of it.
 *
 * The real message: a text arrived at Living Canvas at 08:22 UTC on 26
 * September, which is 09:22 in the shop.
 */
test("summer time is an hour on, which is the whole point", () => {
  assert.equal(ukTime("2026-09-26T08:22:19Z"), "09:22");
  assert.notEqual(ukTime("2026-09-26T08:22:19Z"), "08:22", "that would be UTC, not the shop");
});

test("winter is the same as UTC, and must not be shifted anyway", () => {
  assert.equal(ukTime("2026-01-15T08:22:00Z"), "08:22");
});

test("twenty-four hour, because a diary is", () => {
  assert.equal(ukTime("2026-01-15T17:40:00Z"), "17:40");
  assert.equal(ukTime("2026-01-15T00:05:00Z"), "00:05");
});

test("the London day is the one the zone says, not UTC's", () => {
  /* Just before midnight in London during summer is still the same day. */
  assert.equal(londonDay("2026-06-15T22:30:00Z"), "2026-06-15");
  /* And an hour later it is the next one, though UTC says it is not. */
  assert.equal(londonDay("2026-06-15T23:30:00Z"), "2026-06-16");
});

test("today and yesterday are named, because that is how an inbox is read", () => {
  const now = new Date("2026-09-26T10:00:00Z");
  assert.equal(ukStamp("2026-09-26T08:22:19Z", now), "Today 09:22");
  assert.equal(ukStamp("2026-09-25T16:40:00Z", now), "Yesterday 17:40");
});

test("older than that gets its date", () => {
  const now = new Date("2026-09-26T10:00:00Z");
  assert.equal(ukStamp("2026-09-24T10:15:00Z", now), "24 Sept 11:15");
});

test("the year appears only once it is a different one", () => {
  const now = new Date("2026-09-26T10:00:00Z");
  assert.doesNotMatch(ukStamp("2026-01-04T09:00:00Z", now), /2026/, "this year needs no year");
  assert.match(ukStamp("2025-12-30T09:00:00Z", now), /2025/, "last year does");
});

test("the day and the stamp agree about which day it is", () => {
  const now = new Date("2026-06-16T09:00:00Z");
  /* 23:30 UTC on the 15th is 00:30 on the 16th in London: today, not yesterday. */
  assert.match(ukStamp("2026-06-15T23:30:00Z", now), /^Today 00:30$/);
  assert.equal(ukDay("2026-06-15T23:30:00Z"), "16 Jun");
});

test("how long ago answers a different question and is kept", () => {
  const now = new Date("2026-09-26T10:00:00Z");
  assert.equal(ukAgo("2026-09-26T09:59:40Z", now), "just now");
  assert.equal(ukAgo("2026-09-26T09:30:00Z", now), "30m ago");
  assert.equal(ukAgo("2026-09-26T07:00:00Z", now), "3h ago");
  assert.equal(ukAgo("2026-09-25T10:00:00Z", now), "yesterday");
  assert.equal(ukAgo("2026-09-23T10:00:00Z", now), "3d ago");
});

/*
 * A server renders once and a browser hydrates; if either reads its own clock
 * the two disagree and React reports a mismatch on every row. Passing `now`
 * in is what stops that, so it must actually be used.
 */
test("nothing here reads the clock on its own when told not to", () => {
  const now = new Date("2026-09-26T10:00:00Z");
  assert.equal(ukStamp("2026-09-26T08:22:19Z", now), ukStamp("2026-09-26T08:22:19Z", now));
  assert.equal(
    ukStamp("2026-09-26T08:22:19Z", new Date("2026-09-27T10:00:00Z")),
    "Yesterday 09:22",
    "the same instant reads differently on a different day, which is the test",
  );
});
