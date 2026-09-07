import { test } from "node:test";
import assert from "node:assert/strict";
import { askedAlready, stillWorthAsking } from "./askedAlready.ts";

/*
 * The case this was written for. Dave answered the walk-ins question in his
 * own words, and the trade's version must not be offered back to him.
 */
test("the same question typed differently counts as asked", () => {
  assert.equal(askedAlready("Do you take walk-ins?", ["Do you do Walk ins?"]), true);
  assert.equal(askedAlready("Where can I park?", ["where can i park"]), true);
  assert.equal(askedAlready("What is the aftercare?", ["Whats the aftercare"]), true);
});

test("a question nobody has asked is worth offering", () => {
  assert.equal(askedAlready("What should I bring?", ["Do you do Walk ins?"]), false);
  assert.equal(askedAlready("Where can I park?", []), false);
});

test("what a tattoo studio is missing, given one answer of their own", () => {
  const suggested = [
    "Do you take walk-ins?",
    "What is the aftercare?",
    "Where can I park?",
    "What should I bring?",
  ];
  assert.deepEqual(stillWorthAsking(suggested, ["Do you do Walk ins?"]), [
    "What is the aftercare?",
    "Where can I park?",
    "What should I bring?",
  ]);
});

test("a business with none is offered all of them", () => {
  assert.deepEqual(stillWorthAsking(["Where can I park?", "How do I pay?"], []), [
    "Where can I park?",
    "How do I pay?",
  ]);
});

test("a business with all of them is offered none", () => {
  const suggested = ["Where can I park?", "What should I bring?"];
  assert.deepEqual(stillWorthAsking(suggested, suggested), []);
});

/*
 * Two suggestions that reduce to the same thing must not both be added, or
 * seeding a fresh business would hand it a duplicate on day one.
 */
test("it does not offer two of the same in one go", () => {
  assert.deepEqual(stillWorthAsking(["Do you take walk-ins?", "Do you do walk ins?"], []), [
    "Do you take walk-ins?",
  ]);
});

/*
 * A question that reduces to nothing once the small words go cannot be
 * compared with anything, so it is never offered. Not a case a trade pack
 * produces, and worth pinning so it stays a quiet skip rather than a crash.
 */
test("a question made only of small words is skipped", () => {
  assert.deepEqual(stillWorthAsking(["Do you?", "Is it?"], []), []);
});

test("an empty question is never offered", () => {
  assert.deepEqual(stillWorthAsking(["", "  "], []), []);
});
