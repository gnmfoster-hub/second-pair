import { test } from "node:test";
import assert from "node:assert/strict";
import { splitQuoted } from "./quotedReply.ts";

/* The one in Neat & Tidy's inbox that Giles said looked like code. */
const REAL = `Hi

I sent you an email a few days ago. I didn't get any response back from you.

May I send an Proposal and Pricing?

thanks,

________________________________
From: Ayera Khan
Sent: Thursday, September 17, 2026 12:55 PM
Subject: Re: Yes


Hi,

I was going through your website, which isn't doing well but has a lot of potential in your business.`;

test("the one that looked like code", () => {
  const { said, quoted } = splitQuoted(REAL);
  assert.ok(said.includes("May I send an Proposal"), said);
  assert.ok(!said.includes("________"), "the rule is still in the visible part");
  assert.ok(!said.includes("From: Ayera"), "the header block is still in the visible part");
  assert.ok(quoted.startsWith("____"));
  assert.ok(quoted.includes("going through your website"));
});

test("Gmail and Apple write it differently", () => {
  const { said, quoted } = splitQuoted(
    "Yes Thursday suits, thanks.\n\nOn Wed, 17 Sep 2026 at 14:02, Karen <k@x.com> wrote:\n> Does Thursday work?",
  );
  assert.equal(said, "Yes Thursday suits, thanks.");
  assert.ok(quoted.includes("Does Thursday work?"));
});

test("an original-message rule is a marker too", () => {
  const { said } = splitQuoted("Sounds good.\n\n-----Original Message-----\nFrom: someone");
  assert.equal(said, "Sounds good.");
});

/*
 * "From:" alone is a word people write. It only counts as a header block when
 * the lines under it are headers too.
 */
test("a sentence starting From: is not a quoted reply", () => {
  const body = "From: the kitchen to the bathroom, everything needs doing.\n\nWhen can you come?";
  const { said, quoted } = splitQuoted(body);
  assert.equal(quoted, "");
  assert.ok(said.includes("When can you come?"));
});

test("an ordinary message is left completely alone", () => {
  const body = "Hi, how much for a deep clean of a 3 bed? Thanks, John";
  assert.deepEqual(splitQuoted(body), { said: body, quoted: "" });
});

/*
 * A forward with no covering note is all history. Hiding it would leave an
 * empty bubble, which is worse than showing the lot.
 */
test("a message that is nothing but history is still shown", () => {
  const body = "________________________________\nFrom: Someone\nSent: Monday\nSubject: Hello";
  const { said, quoted } = splitQuoted(body);
  assert.ok(said.includes("From: Someone"));
  assert.equal(quoted, "");
});
