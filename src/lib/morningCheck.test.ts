import { test } from "node:test";
import assert from "node:assert/strict";
import {
  morningReport,
  morningKey,
  londonDay,
  londonHour,
  isMorning,
  type Check,
} from "./morningCheck.ts";

const ok = (what: string): Check => ({ what, ok: true, detail: "fine" });
const bad = (what: string, detail = "broken"): Check => ({ what, ok: false, detail });
const warn = (what: string, detail = "worth a look"): Check => ({
  what,
  ok: false,
  warn: true,
  detail,
});

const SITE = "https://www.second-pair.com";

test("a good morning says so in the subject", () => {
  const r = morningReport([ok("Backup"), ok("Email")], "23 September", SITE);
  assert.equal(r.subject, "Second Pair: all well");
  assert.equal(r.bad, 0);
});

test("a bad morning counts what is wrong, in the subject", () => {
  const r = morningReport([bad("Backup"), ok("Email"), bad("Texts")], "23 September", SITE);
  assert.equal(r.subject, "Second Pair: 2 things wrong");
  assert.equal(r.bad, 2);
});

test("one thing wrong is not two things", () => {
  const r = morningReport([bad("Backup"), ok("Email")], "23 September", SITE);
  assert.equal(r.subject, "Second Pair: 1 thing wrong");
});

/*
 * A warning is not a failure, and the distinction has to survive into the
 * subject. Stripe in test mode is right for a demo and wrong for a real
 * business: worth saying, not worth waking up to.
 */
test("a warning does not make the morning bad", () => {
  const r = morningReport([ok("Backup"), warn("Stripe", "test mode")], "23 September", SITE);
  assert.equal(r.subject, "Second Pair: all well (1 to note)");
  assert.equal(r.bad, 0);
  assert.match(r.text, /WORTH KNOWING/);
  assert.match(r.text, /Stripe: test mode/);
});

test("what is wrong comes before what is fine", () => {
  const r = morningReport([ok("Email"), bad("Backup", "no file for two days")], "23 Sept", SITE);
  assert.ok(r.text.indexOf("WRONG") < r.text.indexOf("FINE"));
  assert.match(r.text, /Backup: no file for two days/);
});

/*
 * The passing checks are named rather than counted. A count hides the morning
 * a check stops being run at all — the number goes down by one and nobody
 * notices, which is the exact failure this email exists to catch.
 */
test("the checks that passed are named", () => {
  const r = morningReport([ok("Backup"), ok("Texts")], "23 September", SITE);
  assert.match(r.text, /Backup: fine/);
  assert.match(r.text, /Texts: fine/);
});

test("a quiet morning still produces an email", () => {
  const r = morningReport([ok("Backup")], "23 September", SITE);
  assert.ok(r.text.length > 0);
  assert.match(r.text, /All well/);
});

test("the day and the site are in it", () => {
  const r = morningReport([ok("Backup")], "23 September", SITE);
  assert.match(r.text, /Checked 23 September\./);
  assert.match(r.text, /second-pair\.com/);
});

test("the key is one per day, not per hour", () => {
  assert.equal(morningKey("2026-09-23"), "morning:2026-09-23");
  assert.notEqual(morningKey("2026-09-23"), morningKey("2026-09-24"));
});

/*
 * London, not UTC. In summer they are an hour apart, so a run at half past
 * eleven at night UTC is already tomorrow here — and would send a second
 * report for a day that has barely started.
 */
test("the day is London's, not the server's", () => {
  /* 22 September 23:30 UTC is 23 September 00:30 in London. */
  assert.equal(londonDay(new Date("2026-09-22T23:30:00Z")), "2026-09-23");
});

test("the hour is London's too", () => {
  assert.equal(londonHour(new Date("2026-09-23T05:10:00Z")), 6); // BST
});

test("it does not send before six", () => {
  /* 04:30 London: the backup window has only just closed. */
  assert.equal(isMorning(new Date("2026-09-23T03:30:00Z")), false);
  /* 06:10 London. */
  assert.equal(isMorning(new Date("2026-09-23T05:10:00Z")), true);
});
