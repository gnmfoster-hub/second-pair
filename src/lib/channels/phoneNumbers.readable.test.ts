import { test } from "node:test";
import assert from "node:assert/strict";
import { readableNumber } from "./phoneNumbers.ts";

test("says a UK mobile the way its owner would", () => {
  assert.equal(readableNumber("+447460076593"), "07460 076593");
});

test("puts a UK landline back to a leading zero", () => {
  assert.equal(readableNumber("+441626123456"), "01626123456");
});

/* Guessing a foreign grouping wrongly reads as a typo, so it is left alone. */
test("leaves anything not UK exactly as it is", () => {
  assert.equal(readableNumber("+13105550123"), "+13105550123");
});

test("survives an empty number without inventing one", () => {
  assert.equal(readableNumber(""), "");
});
