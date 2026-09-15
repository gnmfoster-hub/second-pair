import { test } from "node:test";
import assert from "node:assert/strict";
import { isStopWord, isStartWord } from "./optOut.ts";

test("STOP in the usual forms is an opt-out", () => {
  for (const t of ["STOP", "stop", " Stop ", "STOP.", "stop all", "UNSUBSCRIBE", "quit", "opt out"]) {
    assert.equal(isStopWord(t), true, t);
  }
});

test("a sentence with stop in it is a message, not an opt-out", () => {
  for (const t of ["can you stop by at 3", "Stop the booking please", "please stop texting me", "", null]) {
    assert.equal(isStopWord(t), false, String(t));
  }
});

test("cancel is about an appointment, never an opt-out", () => {
  assert.equal(isStopWord("cancel"), false);
  assert.equal(isStopWord("CANCEL"), false);
  assert.equal(isStopWord("end"), false);
});

test("START brings texts back", () => {
  assert.equal(isStartWord("START"), true);
  assert.equal(isStartWord("unstop"), true);
  assert.equal(isStartWord("start at 10?"), false);
});
