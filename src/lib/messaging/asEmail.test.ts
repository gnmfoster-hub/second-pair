import { test } from "node:test";
import assert from "node:assert/strict";
import { asEmail, alreadyGreets, subjectFor } from "./asEmail.ts";

const base = { businessName: "Willow & Co", canReply: true };

test("it greets somebody by name and signs off as the business", () => {
  const { text } = asEmail({ ...base, body: "We can do Thursday at two.", firstName: "Jane" });
  assert.match(text, /^Hello Jane,/);
  assert.match(text, /Willow & Co$/);
});

test("with no name it still greets, rather than opening mid-sentence", () => {
  const { text } = asEmail({ ...base, body: "We can do Thursday." });
  assert.match(text, /^Hello,/);
});

/*
 * The assistant usually greets people itself. A second one on top reads as a
 * machine not listening to itself, which is the impression this exists to
 * avoid.
 */
test("a message that already says hello is not greeted twice", () => {
  const { text } = asEmail({ ...base, body: "Hi Jane, we can do Thursday.", firstName: "Jane" });
  assert.match(text, /^Hi Jane, we can do Thursday\./);
  assert.doesNotMatch(text, /Hello Jane/);
});

test("every ordinary opening counts as a greeting", () => {
  for (const opener of ["Hi there", "Hello!", "Hey Jane", "Dear Jane", "Good morning Jane"]) {
    assert.equal(alreadyGreets(opener), true, opener);
  }
  assert.equal(alreadyGreets("We can do Thursday"), false);
  // Not a greeting: a word that merely starts with one.
  assert.equal(alreadyGreets("Highlights are £120"), false);
});

test("a block of lines becomes paragraphs", () => {
  const { text } = asEmail({ ...base, body: "We can do Thursday at two.\nIt is £95.\nSarah does them." });
  assert.match(text, /two\.\n\nIt is £95\.\n\nSarah/);
});

test("but writing that was already spaced is left exactly alone", () => {
  const written = "First thing.\n\nSecond thing.";
  const { text } = asEmail({ ...base, body: written });
  assert.ok(text.includes(written));
});

test("it says replying works, when replying works", () => {
  assert.match(asEmail({ ...base, body: "Yes." }).text, /reply to this email/);
  assert.doesNotMatch(
    asEmail({ ...base, canReply: false, body: "Yes." }).text,
    /reply to this email/,
  );
});

// ─────────────────────────────────────────────────────────── the subject

test("the subject names the business, not us", () => {
  assert.equal(subjectFor("Willow & Co"), "Your enquiry — Willow & Co");
});

test("and what it is about, where that is known", () => {
  assert.equal(subjectFor("Willow & Co", "Balayage"), "Balayage — Willow & Co");
});

test("a long one is trimmed to survive a phone's preview line", () => {
  const long = "A really very extremely long description of what somebody asked about";
  const s = subjectFor("Willow & Co", long);
  assert.ok(s.length < long.length + 14, s);
  assert.match(s, /…— Willow & Co$|… — Willow & Co$/);
});

test("an empty description falls back rather than making a dangling subject", () => {
  assert.equal(subjectFor("Willow & Co", "   "), "Your enquiry — Willow & Co");
  assert.equal(subjectFor("Willow & Co", null), "Your enquiry — Willow & Co");
});
