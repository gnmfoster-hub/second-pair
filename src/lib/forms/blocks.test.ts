import { test } from "node:test";
import assert from "node:assert/strict";
import { validSignature, typedSignature, isTypedSignature } from "./blocks.ts";


/*
 * The signature box is a canvas driven by pointer events: not focusable, no
 * keyboard path, and required. A keyboard-only or screen-reader user could not
 * complete a consent form at all — on the one kind of document in the product
 * that is legally operative.
 */
test("a form can be signed by typing as well as by drawing", () => {
  assert.equal(validSignature(typedSignature("Jo Marsh")), true);
  assert.equal(isTypedSignature(typedSignature("Jo Marsh")), true);
  assert.equal(typedSignature("  Jo Marsh  "), "typed:Jo Marsh", "trimmed, so a space is not a name");
});

test("a typed signature still has to be a name", () => {
  assert.equal(validSignature("typed:"), false);
  assert.equal(validSignature("typed:   "), false);
  assert.equal(validSignature("typed:J"), false, "one letter is not somebody signing");
});

test("a drawn signature is still told apart from a typed one", () => {
  const drawn = "data:image/png;base64," + "A".repeat(400);
  assert.equal(isTypedSignature(drawn), false);
  assert.equal(isTypedSignature(null), false);
  assert.equal(isTypedSignature(""), false);
});
