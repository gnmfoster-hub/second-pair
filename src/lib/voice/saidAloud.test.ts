import { test } from "node:test";
import assert from "node:assert/strict";
import { saidAloud } from "./saidAloud.ts";

/*
 * The one that matters most, because it is in a business's name and the name
 * is the first thing said on every single call.
 */
test("an ampersand is a word out loud", () => {
  assert.equal(saidAloud("Hello, Neat & Tidy Solutions."), "Hello, Neat and Tidy Solutions.");
  assert.equal(saidAloud("Cogs & Co Garage"), "Cogs and Co Garage");
  assert.doesNotMatch(saidAloud("Neat & Tidy"), /&/);
});

test("money is said the way somebody says it", () => {
  assert.equal(saidAloud("It is £45."), "It is 45 pounds.");
  assert.equal(saidAloud("£45.50"), "45 pounds 50");
  assert.equal(saidAloud("£45.5"), "45 pounds 50", "a model writing .5 means fifty pence");
  assert.equal(saidAloud("£45.00"), "45 pounds", "nobody says pounds zero zero");
  assert.equal(saidAloud("£1,250"), "1250 pounds", "the comma is punctuation, not a pause");
});

test("times are two numbers, not a colon", () => {
  assert.equal(saidAloud("at 9:30am"), "at 9 30 am");
  assert.equal(saidAloud("at 2:15pm"), "at 2 15 pm");
  assert.equal(saidAloud("at 14:00"), "at 14 o'clock");
  assert.doesNotMatch(saidAloud("9:30am"), /:/);
});

test("a phone number is read a digit at a time", () => {
  assert.equal(saidAloud("ring 07700900123"), "ring 0 7 7 0 0 9 0 0 1 2 3");
  assert.match(saidAloud("ring 07700 900123"), /^ring 0 7 7 0 0 9 0 0 1 2 3$/);
});

test("a short number is left alone", () => {
  assert.equal(saidAloud("in 45 minutes"), "in 45 minutes");
  assert.equal(saidAloud("2026"), "2026", "a year is not a telephone number");
});

test("a postcode is spelled out, which is how it is given on a phone", () => {
  assert.equal(saidAloud("EX1 2AB"), "E X 1 2 A B");
  assert.equal(saidAloud("TQ12 1AA"), "T Q 1 2 1 A A");
});

test("a dash between things is a range, not silence", () => {
  assert.equal(saidAloud("Mon–Fri"), "Monday to Friday");
  assert.equal(saidAloud("9-5"), "9 to 5");
});

test("shorthand a reader expands silently", () => {
  assert.equal(saidAloud("Tue and Thu"), "Tuesday and Thursday");
  assert.equal(saidAloud("approx 30 mins"), "about 30 minutes");
  assert.equal(saidAloud("2 hrs"), "2 hours");
  assert.equal(saidAloud("e.g. a full groom"), "for example a full groom");
});

/*
 * The failure that is not worth risking to smooth a postcode: these strings
 * are escaped into XML, and a tag that does not close is a call that drops
 * silently.
 */
test("nothing it writes can break the document it goes into", () => {
  for (const input of [
    "£45 & 9:30am at EX1 2AB, ring 07700900123",
    "Mon–Fri, approx 2 hrs, e.g. £1,250.50",
    "",
    "no changes needed here",
  ]) {
    const out = saidAloud(input);
    assert.doesNotMatch(out, /[<>]/, "no markup may be introduced");
  }
});

test("an ordinary sentence comes back unchanged", () => {
  const plain = "That is booked in with Karen on Tuesday. See you then.";
  assert.equal(saidAloud(plain), plain);
});

test("everything at once, which is what a real reply looks like", () => {
  assert.equal(
    saidAloud("Neat & Tidy can do Mon–Fri. A deep clean is approx £250 and takes 5 hrs."),
    "Neat and Tidy can do Monday to Friday. A deep clean is about 250 pounds and takes 5 hours.",
  );
});
