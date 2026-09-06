import { test } from "node:test";
import assert from "node:assert/strict";
import { wasMissed, missedCallText } from "./missedCall.ts";

test("a call somebody answered is not missed", () => {
  assert.equal(wasMissed("completed"), false);
  assert.equal(wasMissed("answered"), false);
  assert.equal(wasMissed("COMPLETED"), false);
});

test("every way a call fails to reach them counts as missed", () => {
  for (const status of ["no-answer", "busy", "failed", "canceled"]) {
    assert.equal(wasMissed(status), true, status);
  }
});

/*
 * Erring towards texting. A text after a call that was answered is a mild
 * redundancy; silence after one that was not is the whole failure.
 */
test("a status we do not recognise is treated as missed", () => {
  assert.equal(wasMissed("something-new"), true);
  assert.equal(wasMissed(null), true);
  assert.equal(wasMissed(undefined), true);
  assert.equal(wasMissed(""), true);
});

test("the text says who it is and asks something", () => {
  const t = missedCallText("Living Canvas Tattoo");
  assert.match(t, /Living Canvas Tattoo/);
  assert.match(t, /missed your call/i);
  assert.match(t, /CALL/);
});

test("a number belonging to one person says so", () => {
  assert.equal(
    missedCallText("The Fold Hair", "Sarah"),
    "Sorry we missed your call — this is Sarah at The Fold Hair. " +
      "Tell me what you need and I can help here, or say CALL and we'll ring you back.",
  );
});

test("a blank name is the business, not a dangling 'at'", () => {
  assert.match(missedCallText("Muddy Paws", "  "), /^Sorry we missed your call — this is Muddy Paws\./);
  assert.match(missedCallText("Muddy Paws", null), /this is Muddy Paws\./);
});
