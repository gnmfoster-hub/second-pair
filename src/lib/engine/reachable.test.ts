import { test } from "node:test";
import assert from "node:assert/strict";
import { missingDetails } from "./reachable.ts";

test("a name and a phone number is enough", () => {
  assert.equal(missingDetails({ name: "Jo", phone: "07700 900321" }), null);
});

test("a name and an email is enough", () => {
  assert.equal(missingDetails({ name: "Jo", email: "jo@example.com" }), null);
});

test("a name on its own is not — nobody can be reached", () => {
  assert.equal(missingDetails({ name: "Jo" }), "a phone number or email address");
});

test("a number on its own is not — the diary would say nothing", () => {
  assert.equal(missingDetails({ phone: "07700 900321" }), "their name");
});

test("an empty contact asks for both", () => {
  assert.equal(missingDetails({}), "their name and a phone number or email address");
  assert.equal(missingDetails(null), "their name and a phone number or email address");
});

/*
 * Whitespace is not a phone number. The saving tool takes what the customer
 * typed without reformatting it, so a stray space is exactly what arrives when
 * somebody presses send early.
 */
test("blank strings are treated as absent", () => {
  assert.equal(missingDetails({ name: " ", phone: "  " }), "their name and a phone number or email address");
  assert.equal(missingDetails({ name: "Jo", phone: " ", email: "" }), "a phone number or email address");
});
