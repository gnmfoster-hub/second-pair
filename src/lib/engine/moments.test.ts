import { test } from "node:test";
import assert from "node:assert/strict";
import { settleMoments } from "./moments.ts";
import type { Moment } from "./moments.ts";

const slots = { kind: "slots", slots: [], person: "Priya" } as unknown as Moment;
const quote = { kind: "quote", person: "Priya" } as unknown as Moment;
const booked = { kind: "booked", person: "Priya" } as unknown as Moment;
const deposit = { kind: "deposit", amountPence: 2000, url: "https://x" } as Moment;

test("times still to choose from are drawn", () => {
  assert.deepEqual(settleMoments([quote, slots]), [quote, slots]);
});

test("times are dropped once one of them has been taken", () => {
  assert.deepEqual(settleMoments([slots, booked]), [booked]);
});

test("the price survives the booking — it is worth reading beside it", () => {
  assert.deepEqual(settleMoments([slots, quote, booked]), [quote, booked]);
});

test("a deposit link survives, being the point of the message", () => {
  assert.deepEqual(settleMoments([booked, deposit]), [booked, deposit]);
});

test("nothing to settle is left alone", () => {
  assert.deepEqual(settleMoments([]), []);
});
