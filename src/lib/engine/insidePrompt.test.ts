import { test } from "node:test";
import assert from "node:assert/strict";
import { insideSystemPrompt } from "./insidePrompt.ts";
import type { Faq, Studio } from "../types.ts";

const studio = {
  id: "s1",
  slug: "inside",
  name: "Second Pair",
  assistant_name: "Bebe",
} as unknown as Studio;

const faqs = [
  { question: "How do I change what the reminders say?", answer: "Settings, then Reminders." },
  { question: "Where do I see what it cost to run?", answer: "The week page." },
] as unknown as Faq[];

test("it says what it is, to somebody who is already a client", () => {
  const p = insideSystemPrompt(studio, faqs);
  assert.match(p, /You are Bebe, the help assistant inside Second Pair\./);
  assert.match(p, /signed in to their own account/);
});

/*
 * The faults the old one had, every one of them from the prompt it was given
 * rather than from its wording. Rendered on 15 October it opened "You are
 * Bebe, the receptionist for Second Pair, a something else" and ran to 20,569
 * characters of booking instructions.
 */
test("none of the booking assistant comes with it", () => {
  const p = insideSystemPrompt(studio, faqs);

  /*
   * "the receptionist for" rather than "receptionist", because the prompt
   * does say what Second Pair is, and that sentence is the reason the
   * assistant knows what it is helping somebody with. The fault was being
   * cast as one: "You are Bebe, the receptionist for Second Pair".
   */
  for (const wrong of [
    "a something else",
    "the receptionist for",
    "Quoting is your job",
    "quote_estimate",
    "get_available_slots",
    "create_booking",
    "Opening hours",
    "size band",
    "deposit",
    "£",
  ]) {
    assert.ok(
      !p.toLowerCase().includes(wrong.toLowerCase()),
      `the inside assistant is still being told about "${wrong}"`,
    );
  }
});

test("it is told it has nothing to book with, not merely told not to book", () => {
  // A model told "never quote" with a quoting tool in its hand will quote.
  const p = insideSystemPrompt(studio, faqs);
  assert.match(p, /You have no diary, no prices, no times and no customers of your own/);
});

test("the answers come through whole, because they are all it knows", () => {
  const p = insideSystemPrompt(studio, faqs);
  assert.match(p, /Q: How do I change what the reminders say\?/);
  assert.match(p, /A: Settings, then Reminders\./);
});

test("with nothing written down it is told to hand over rather than invent", () => {
  const p = insideSystemPrompt(studio, []);
  assert.match(p, /Nothing has been written down for you yet/);
  assert.doesNotMatch(p, /Q: /);
});

test("a blank answer is not offered as one", () => {
  const half = [
    { question: "Half written", answer: "   " },
    { question: "", answer: "Orphaned" },
  ] as unknown as Faq[];
  const p = insideSystemPrompt(studio, half);
  assert.doesNotMatch(p, /Half written/);
  assert.doesNotMatch(p, /Orphaned/);
});

test("no long dashes in what it is told, since it copies how it is written to", () => {
  assert.doesNotMatch(insideSystemPrompt(studio, faqs), /[—–]/);
});

test("it is much smaller than the one it replaced", () => {
  // The old one was 20,569 characters before a single answer was added.
  const bare = insideSystemPrompt(studio, []);
  assert.ok(bare.length < 4000, `the brief alone is ${bare.length} characters`);
});
