import { test } from "node:test";
import assert from "node:assert/strict";
import { alertKey, alertAddress } from "./platformAlert.ts";

/*
 * During an outage every message fails, so the thing that stops four hundred
 * identical emails is this key and the unique index behind it — not a counter
 * in memory, which would be one per instance.
 */
test("one alert per problem per hour", () => {
  const a = alertKey("turn-failed", new Date("2026-09-16T15:02:11Z"));
  const b = alertKey("turn-failed", new Date("2026-09-16T15:59:59Z"));
  assert.equal(a, b, "the same hour is the same claim");

  const later = alertKey("turn-failed", new Date("2026-09-16T16:00:00Z"));
  assert.notEqual(a, later, "the next hour says it again");

  const other = alertKey("watchdog", new Date("2026-09-16T15:02:11Z"));
  assert.notEqual(a, other, "a different problem is not silenced by this one");
});

test("the key says what it is, so it can be read in the table", () => {
  assert.equal(alertKey("watchdog", new Date("2026-09-16T02:00:00Z")), "alert:watchdog:2026-09-16T02");
});

test("alerts go to our address, never to a business", () => {
  const before = { alert: process.env.PLATFORM_ALERT_EMAIL, from: process.env.EMAIL_FROM };

  process.env.PLATFORM_ALERT_EMAIL = "Ops <ops@second-pair.com>";
  assert.equal(alertAddress(), "ops@second-pair.com", "the name is stripped off");

  delete process.env.PLATFORM_ALERT_EMAIL;
  process.env.EMAIL_FROM = "Second Pair <hello@second-pair.com>";
  assert.equal(alertAddress(), "hello@second-pair.com", "the address we send from is one we read");

  delete process.env.EMAIL_FROM;
  assert.equal(alertAddress(), null, "with nowhere to send, it says so rather than guessing");

  if (before.alert) process.env.PLATFORM_ALERT_EMAIL = before.alert;
  if (before.from) process.env.EMAIL_FROM = before.from;
});
