import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatPence,
  formatRange,
  parsePounds,
  renderPolicy,
  penceToInput,
} from "./money.ts";

/**
 * Every price the assistant says out loud, and every price an owner types in.
 *
 * Money is integer pence everywhere inside; this is the only place it becomes
 * words. A rounding slip here is a wrong quote to a customer, and a parsing
 * slip is a rate saved as something the owner did not mean.
 */

// ------------------------------------------------------------- saying it

test("a round number has no pointless pence", () => {
  assert.equal(formatPence(6500), "£65");
  assert.equal(formatPence(0), "£0");
});

test("an odd number keeps both digits", () => {
  assert.equal(formatPence(6550), "£65.50");
  assert.equal(formatPence(6505), "£65.05");
});

test("thousands are grouped, the way somebody would write it", () => {
  assert.equal(formatPence(120000), "£1,200");
});

test("a range reads as a range", () => {
  assert.equal(formatRange(5000, 6500), "£50 to £65");
});

test("a range of one number is just the number", () => {
  // "£50 to £50" reads as a mistake and invites a question.
  assert.equal(formatRange(5000, 5000), "£50");
});

// ---------------------------------------------------------- reading it back

test("a plain number is pounds", () => {
  assert.equal(parsePounds("65"), 6500);
});

test("pence are kept", () => {
  assert.equal(parsePounds("65.50"), 6550);
});

test("a pound sign is allowed, because people type it", () => {
  assert.equal(parsePounds("£65"), 6500);
  assert.equal(parsePounds("£1,200.50"), 120050);
});

test("spaces are allowed, because people type those too", () => {
  assert.equal(parsePounds(" 65 "), 6500);
});

test("empty means nothing was said, not zero", () => {
  // Zero is a price. Blank is an absence, and the two must not be confused —
  // a blank rate saved as £0 would have the assistant quoting nothing.
  assert.equal(parsePounds(""), null);
  assert.equal(parsePounds("   "), null);
  assert.equal(parsePounds(null), null);
  assert.equal(parsePounds(undefined), null);
});

test("nonsense is refused rather than guessed at", () => {
  assert.equal(parsePounds("about fifty"), null);
  assert.equal(parsePounds("--"), null);
});

test("a negative price is refused", () => {
  assert.equal(parsePounds("-50"), null);
});

test("fractions of a penny are rounded, not truncated", () => {
  // 0.1 + 0.2 arithmetic: 65.555 must not become 6555 by dropping the rest.
  assert.equal(parsePounds("65.555"), 6556);
  assert.equal(parsePounds("0.005"), 1);
});

test("what is typed comes back the same after a round trip", () => {
  for (const typed of ["65", "65.50", "1200", "0"]) {
    const pence = parsePounds(typed);
    assert.ok(pence != null);
    assert.equal(parsePounds(penceToInput(pence)), pence, typed);
  }
});

// ------------------------------------------------------------ back into a form

test("a form field shows a tidy number, not trailing zeros", () => {
  assert.equal(penceToInput(6500), "65");
  assert.equal(penceToInput(6550), "65.50");
});

test("nothing set means an empty box", () => {
  assert.equal(penceToInput(null), "");
  assert.equal(penceToInput(undefined), "");
});

// ------------------------------------------------ the policy read out to clients

test("the deposit figure replaces its placeholder", () => {
  assert.equal(
    renderPolicy("A deposit of {{amount}} is required.", { deposit: 5000 }),
    "A deposit of £50 is required.",
  );
});

test("all three spellings of the placeholder work", () => {
  for (const name of ["amount", "deposit", "deposit_amount"]) {
    assert.match(renderPolicy(`Pay {{${name}}} first.`, { deposit: 2500 }), /£25/);
  }
});

test("no deposit set reads as a sentence, not a gap", () => {
  assert.equal(
    renderPolicy("A deposit of {{amount}} is required.", { deposit: null }),
    "A deposit of the deposit is required.",
  );
});

test("an unknown placeholder is stripped, never spoken", () => {
  // The policy is read to clients word for word. "{{oops}}" reaching one is
  // worse than a plainer sentence.
  const out = renderPolicy("Give {{oops}} notice please.", { deposit: 5000 });
  assert.doesNotMatch(out, /\{\{|\}\}/);
  assert.equal(out, "Give notice please.");
});

test("a policy with no placeholders is left exactly alone", () => {
  const plain = "48 hours' notice, or the deposit is kept.";
  assert.equal(renderPolicy(plain, { deposit: 5000 }), plain);
});
