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
  assert.equal(subjectFor("Willow & Co"), "Your enquiry, Willow & Co");
});

test("and what it is about, where that is known", () => {
  assert.equal(subjectFor("Willow & Co", "Balayage"), "Balayage, Willow & Co");
});

test("a long one is trimmed to survive a phone's preview line", () => {
  const long = "A really very extremely long description of what somebody asked about";
  const s = subjectFor("Willow & Co", long);
  assert.ok(s.length < long.length + 14, s);
  assert.match(s, /…, Willow & Co$/);
});

test("an empty description falls back rather than making a dangling subject", () => {
  assert.equal(subjectFor("Willow & Co", "   "), "Your enquiry, Willow & Co");
  assert.equal(subjectFor("Willow & Co", null), "Your enquiry, Willow & Co");
});

// ──────────────────────────────────────────────── the laid-out version

/*
 * The html half, added on 19 October. Giles: "they are all just boring text."
 *
 * This is the email the product sends most of, and it had no html at all, so
 * every reply arrived in whatever typeface the reader's mail client defaults
 * to. These are the four things that can go wrong with wrapping it, rather
 * than a check that the markup is unchanged: the body going missing, the
 * business's name being said twice, somebody's apostrophe closing a tag, and
 * the font being dropped again.
 */
test("the laid-out version carries what was actually said", () => {
  const { html } = asEmail({ ...base, body: "We can do Thursday at two.", firstName: "Jane" });
  assert.match(html, /Hello Jane,/);
  assert.match(html, /We can do Thursday at two\./);
  assert.match(html, /<!doctype html>|<html/i);
});

test("the business is named once, at the top, not again as a sign-off", () => {
  /*
   * The text signs off with the business's name because a plain-text email
   * has no letterhead. The html does have one, so a sign-off as well would
   * print the name twice in nine lines.
   */
  const { html, text } = asEmail({ ...base, body: "Yes, that works.", firstName: "Jane" });
  assert.match(text, /Willow & Co$/);
  assert.doesNotMatch(html, /Yes, that works\.[\s\S]{0,200}Willow &amp; Co[\s\S]{0,40}<\/p>/);
});

test("an apostrophe or an ampersand cannot break the markup", () => {
  const { html } = asEmail({
    ...base,
    businessName: "Amber's Paws & Pastures",
    body: 'We are open 9 til 5 & "closed" on <Sundays>.',
  });
  assert.match(html, /Amber&#39;s Paws &amp; Pastures/);
  assert.doesNotMatch(html, /<Sundays>/);
  assert.match(html, /&lt;Sundays&gt;/);
});

test("it sets a typeface, which is the whole point", () => {
  const { html } = asEmail({ ...base, body: "Yes." });
  assert.match(html, /font-family:[^;"]*sans-serif/i);
});

test("the photograph goes on when there is one, and nothing breaks when there is not", () => {
  const withPhoto = asEmail({
    ...base,
    body: "Yes.",
    photoUrl: "https://example.com/p.jpg",
  }).html;
  assert.match(withPhoto, /<img src="https:\/\/example\.com\/p\.jpg"/);
  assert.doesNotMatch(asEmail({ ...base, body: "Yes." }).html, /<img/);
});

/*
 * Paragraphs, because the reason for the html is readability and the
 * assistant writes in one block as often as not.
 */
test("a message written as one block comes out as paragraphs", () => {
  const { html } = asEmail({
    ...base,
    body: "Thursday at two is free.\nIt takes about an hour.\nShall I put you in?",
  });
  /* Parenthesised, because ?? binds tighter than >= and the first draft of
   * this line compared the count against a boolean. */
  assert.ok((html.match(/<p /g)?.length ?? 0) >= 3, html);
});
