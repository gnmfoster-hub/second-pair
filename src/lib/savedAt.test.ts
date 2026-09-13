import { test } from "node:test";
import assert from "node:assert/strict";
import { savedWords } from "./savedAt.ts";

test("a saved moment is read in the business's own time", () => {
  // 18:16 UTC in September is 19:16 in London.
  const words = savedWords("2026-09-13T18:16:18.541096+00:00");
  assert.match(words ?? "", /Sun 13 Sep/);
  assert.match(words ?? "", /19:16/);
});

test("never saved says nothing rather than guessing a date", () => {
  assert.equal(savedWords(null), null);
  assert.equal(savedWords(undefined), null);
  assert.equal(savedWords(""), null);
});

/*
 * A column that is not there yet arrives as undefined, and a bad value should
 * not take a settings page down over a caption.
 */
test("something that is not a date is not a date", () => {
  assert.equal(savedWords("not a date"), null);
});

test("a timezone that was never set falls back to here, not to UTC", () => {
  assert.equal(savedWords("2026-09-13T18:16:00+00:00", null), savedWords("2026-09-13T18:16:00+00:00"));
});
