import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseRoutes, preferenceOf, textsAllowed } from "./messageChannels.ts";

const email = { channel: "email", to: "marie@example.com", open: true };
const sms = { channel: "sms", to: "+447700900123", open: true };
const whatsapp = { channel: "whatsapp", to: "wa:1", open: true };
const shut = { channel: "whatsapp", to: "wa:1", open: false };

const names = (routes: { channel: string }[]) => routes.map((r) => r.channel);

/*
 * The default must be today's behaviour exactly. Running the migration is not
 * allowed to change what any live business sends, and a business that has
 * never opened the setting has not asked for anything.
 */
test("the default is one channel, the one they came in on", () => {
  assert.deepEqual(names(chooseRoutes("as_they_came", [whatsapp, email, sms])), ["whatsapp"]);
});

test("anything unrecognised reads as the default, never as something new", () => {
  assert.equal(preferenceOf(undefined), "as_they_came");
  assert.equal(preferenceOf(null), "as_they_came");
  assert.equal(preferenceOf("nonsense"), "as_they_came");
  assert.equal(preferenceOf("both"), "both");
});

test("both sends on both, where we hold both", () => {
  assert.deepEqual(names(chooseRoutes("both", [email, sms])), ["email", "sms"]);
});

test("both with only one of them sends on that one", () => {
  assert.deepEqual(names(chooseRoutes("both", [email])), ["email"]);
  assert.deepEqual(names(chooseRoutes("both", [sms])), ["sms"]);
});

/*
 * "Both" is a statement about email and text, not an instruction to say
 * nothing when there is neither — somebody who only ever used WhatsApp must
 * still hear about their appointment.
 */
test("both falls back to whatever is open when there is neither", () => {
  assert.deepEqual(names(chooseRoutes("both", [whatsapp])), ["whatsapp"]);
});

test("email first prefers the address and falls back to the number", () => {
  assert.deepEqual(names(chooseRoutes("email_first", [email, sms])), ["email"]);
  assert.deepEqual(names(chooseRoutes("email_first", [sms])), ["sms"]);
});

test("email only never texts, even when there is a number", () => {
  assert.deepEqual(names(chooseRoutes("email_only", [email, sms])), ["email"]);
  assert.deepEqual(chooseRoutes("email_only", [sms]), []);
});

test("sms only never emails", () => {
  assert.deepEqual(names(chooseRoutes("sms_only", [email, sms])), ["sms"]);
  assert.deepEqual(chooseRoutes("sms_only", [email]), []);
});

test("a shut channel is never used", () => {
  assert.deepEqual(chooseRoutes("as_they_came", [shut]), []);
  assert.deepEqual(names(chooseRoutes("as_they_came", [shut, email])), ["email"]);
});

/*
 * The ceiling stops the spend, not the message. A business over its text
 * limit still emails people about their appointments.
 */
test("past the ceiling, both becomes email alone", () => {
  assert.deepEqual(names(chooseRoutes("both", [email, sms], false)), ["email"]);
});

test("past the ceiling, email first is unaffected where there is an address", () => {
  assert.deepEqual(names(chooseRoutes("email_first", [email, sms], false)), ["email"]);
});

/*
 * And the uncomfortable one, said out loud: a business that has chosen texts
 * only and hit its ceiling sends nothing. That is what a ceiling means, and it
 * is why the screen has to say so rather than leaving it to be discovered.
 */
test("past the ceiling, texts only sends nothing at all", () => {
  assert.deepEqual(chooseRoutes("sms_only", [email, sms], false), []);
});

test("no ceiling set means texts always allowed", () => {
  assert.equal(textsAllowed(5000, null), true);
  assert.equal(textsAllowed(5000, undefined), true);
});

test("the ceiling is reached, not exceeded", () => {
  assert.equal(textsAllowed(99, 100), true);
  assert.equal(textsAllowed(100, 100), false);
  assert.equal(textsAllowed(101, 100), false);
});
