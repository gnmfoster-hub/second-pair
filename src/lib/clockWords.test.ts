import { test } from "node:test";
import assert from "node:assert/strict";
import { clockWords, bothWays } from "./clockWords.ts";

test("the afternoon, which is the one it gets wrong", () => {
  // Willow is open until 17:00 and the assistant said "3".
  assert.equal(clockWords("17:00"), "5pm");
  assert.equal(clockWords("18:00"), "6pm");
  assert.equal(clockWords("13:00"), "1pm");
  assert.equal(clockWords("16:30"), "4:30pm");
});

test("the morning", () => {
  assert.equal(clockWords("09:00"), "9am");
  assert.equal(clockWords("08:30"), "8:30am");
  assert.equal(clockWords("07:05"), "7:05am");
  assert.equal(clockWords("11:45"), "11:45am");
});

test("the two everybody has to stop and think about", () => {
  assert.equal(clockWords("12:00"), "midday");
  assert.equal(clockWords("00:00"), "midnight");
  // Either side of them is ordinary again.
  assert.equal(clockWords("12:30"), "12:30pm");
  assert.equal(clockWords("00:30"), "12:30am");
});

test("anything that is not a time is left exactly as it was", () => {
  // Better a prompt that reads oddly than one that invents a time.
  for (const odd of ["", "closed", "9", "25:00", "09:70", "9.00", "nine"]) {
    assert.equal(clockWords(odd), odd);
  }
});

test("both forms, so saying it is copying rather than converting", () => {
  assert.equal(bothWays("09:00", "17:00"), "09:00 to 17:00 (9am to 5pm)");
  assert.equal(bothWays("08:30", "12:30"), "08:30 to 12:30 (8:30am to 12:30pm)");
});

test("a line that cannot be converted is not dressed up as one", () => {
  assert.equal(bothWays("closed", "closed"), "closed to closed");
});
