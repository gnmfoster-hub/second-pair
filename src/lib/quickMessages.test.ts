import { test } from "node:test";
import assert from "node:assert/strict";
import { fillFor, firstNameOf, STARTERS } from "./quickMessages.ts";
import { segments } from "./reminderText.ts";

test("it greets somebody by the name they are called", () => {
  assert.equal(firstNameOf("Margaret Thatcher-Wilson"), "Margaret");
  assert.equal(firstNameOf("  aisha  "), "aisha");
  assert.equal(firstNameOf(null), "");
  assert.equal(firstNameOf(""), "");
});

/*
 * The whole point of filling it here: a picker that drops "{{name}}" into the
 * box makes every use a find-and-replace, and the one time somebody forgets, a
 * customer is addressed as a curly brace.
 */
test("the wording arrives ready to send", () => {
  const out = fillFor("Hi {{name}}, it's {{business}} here.", {
    name: "Marie Duclos",
    business: "Willow & Co",
  });
  assert.equal(out, "Hi Marie, it's Willow & Co here.");
  assert.ok(!out.includes("{{"));
});

/*
 * Somebody with no name on their record still gets a sentence that reads.
 */
test("a client with no name is greeted, not left with a hole", () => {
  const out = fillFor("Hi {{name}}, see you soon.", { name: null });
  assert.equal(out, "Hi there, see you soon.");
});

/*
 * An ad-hoc message is not attached to an appointment, so there is no honest
 * value for when or link. Stripped rather than left in, which is what the
 * reminder renderer already does.
 */
test("placeholders with nothing behind them are taken out", () => {
  const out = fillFor("See you {{when}} — details here {{link}}. Bye {{name}}.", {
    name: "Sam",
  });
  assert.ok(!out.includes("{{"));
  assert.ok(!out.includes("undefined"));
  assert.ok(out.includes("Bye Sam."));
});

test("every starter is sendable as it stands", () => {
  for (const s of STARTERS) {
    const out = fillFor(s.body, { name: "Sam", business: "Willow & Co" });
    assert.ok(!out.includes("{{"), `${s.label} left a placeholder behind`);
    assert.ok(out.length > 20, `${s.label} is too short to be a message`);
    assert.ok(s.label.length <= 24, `${s.label} is too long for a chip`);
  }
});

/*
 * No prices and no promises about timing in a starter. A business must never
 * have to correct a wording before it is safe to send, and a number we made up
 * is exactly the thing somebody sends without reading.
 */
test("no starter invents a price", () => {
  for (const s of STARTERS) {
    assert.ok(!/£\s*\d/.test(s.body), `${s.label} names a price`);
    assert.ok(!/\b\d+%/.test(s.body), `${s.label} names a discount`);
  }
});

test("the picker stays short enough to read", () => {
  assert.ok(STARTERS.length <= 8);
});

/*
 * ── What these cost to send ─────────────────────────────────────────────────
 *
 * Added 29 September, after the same fault was found in the shipped reminders.
 *
 * A text is 160 characters, and one character outside the GSM alphabet drops it
 * to 70. Five of these six wordings carried an em dash, so they were charged as
 * two or three texts each: fourteen texts across the six, where seven will do.
 * These are the messages a business sends constantly - running late, a slot has
 * come up, sorry we missed you - so it is the same money over and over.
 *
 * Unlike a reminder, nothing cuts these down on the way out. forOneText is
 * applied to reminders and campaigns and not to a message somebody types by
 * hand, so they arrived whole and simply cost more. That is worth being precise
 * about: the money was real, the lost sentence was not.
 */
test("a starter is not quietly charged as two texts", () => {
  const dear = [];
  for (const s of STARTERS) {
    const filled = fillFor(s.body, { name: "Marie", business: "Amber's Paws" });
    const odd = [...new Set([...filled].filter((c) => c.charCodeAt(0) > 127))];
    if (odd.length) dear.push(`${s.label}: ${odd.join(" ")}`);
  }
  assert.deepEqual(
    dear,
    [],
    `one character outside GSM takes a text from 160 to 70: ${dear.join("; ")}`,
  );
});

/*
 * And the outcome that actually matters, which is the count itself.
 *
 * One of the six is over 160 characters on its own merits - chasing a deposit
 * runs to 182 - so it is two texts for a good reason rather than a bad one, and
 * is named here rather than allowed by a rule. Everything else fits in one.
 */
test("five of the six fit in a single text, and the sixth is long for a reason", () => {
  const over = [];
  for (const s of STARTERS) {
    const filled = fillFor(s.body, { name: "Marie", business: "Amber's Paws" });
    if (segments(filled) > 1) over.push(`${s.label} (${filled.length} chars)`);
  }
  assert.equal(over.length, 1, `expected only the deposit chase to run long: ${over.join("; ")}`);
  assert.match(over[0], /deposit/i);
});
