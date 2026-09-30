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

/*
 * ── The email that made this matter to the assistant, not just the screen ────
 *
 * 30 September, Neat & Tidy. Samantha asked on the website about a regular
 * clean and was quoted. Karen then wrote to her by hand, from her own mail
 * client, offering "a quick chat about what you are looking for, and then I can
 * pop round to see the place and give you a firm price".
 *
 * Samantha replied from her iPhone with the days she is at home. Her mail client
 * quoted Karen's whole email underneath, as every mail client does - and the
 * assistant was handed the subject and the entire body as one string. So Karen's
 * words arrived as part of what the customer had said, and the assistant
 * answered by offering to book a two hour clean at forty pounds: the opposite of
 * what Karen had offered, to somebody who had just written that she had never
 * had a cleaner and had no idea what to ask for.
 *
 * This was a display helper until then. The real email is the fixture, because a
 * made-up one would have been written to pass.
 */
const SAMANTHA = [
  "Hello,",
  "",
  "Thanks for getting back to me. We've never had a cleaner before so I have no idea what to ask for!",
  "",
  "I work from home Mondays and Tuesdays so will be around in the day between 8am and 2pm on those days.",
  "",
  "Thanks",
  "",
  "Samantha",
  "",
  "Sent from my iPhone",
  "",
  "> On 30 Sep 2026, at 14:25, info@neatandtidysolutions.co.uk wrote:",
  "> ",
  "> Hi Samantha,",
  "> ",
  "> It would be good to have a quick chat about what you are looking for, and then I can pop round to see the place and give you a firm price.",
  "> ",
  "> Kind regards,",
  "> Karen",
].join("\n");

test("an iPhone reply is told apart from the email it is answering", () => {
  const { said, quoted } = splitQuoted(SAMANTHA);

  /* What she actually wrote this time. */
  assert.match(said, /never had a cleaner before/);
  assert.match(said, /Mondays and Tuesdays/);

  /* And Karen's words are not among it, which is the whole fault. */
  assert.doesNotMatch(said, /pop round to see the place/);
  assert.doesNotMatch(said, /Kind regards/);

  /*
   * The history is kept rather than thrown away. It is the only record this
   * system has of Karen's reply, because she sent it from her own mail client -
   * so dropping it would leave the assistant not knowing a visit had been
   * offered at all, which is wrong in a different direction.
   */
  assert.match(quoted, /pop round to see the place and give you a firm price/);
});

/*
 * "Sent from my iPhone" is hers, not history.
 *
 * It sits directly above the quote marker and is the commonest thing to lose to
 * an over-eager trim. Losing it is harmless; losing the line above it is not,
 * and a trimmer that starts one line early does both.
 */
test("the signature above the quote stays with what she wrote", () => {
  const { said } = splitQuoted(SAMANTHA);
  assert.match(said, /Sent from my iPhone/);
});
