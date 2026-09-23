import { test } from "node:test";
import assert from "node:assert/strict";
import { fillFor, firstNameOf, STARTERS } from "./quickMessages.ts";

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
