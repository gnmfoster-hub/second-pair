import { test } from "node:test";
import assert from "node:assert/strict";
import { buildEmail, emailText, escapeHtml } from "./emailTemplate.ts";

const basic = { business: "Willow & Co", body: "See you tomorrow, Marie." };

/*
 * Giles, 21 October: the line at the foot of a reminder "is more internal than
 * customer facing". It read "Sent by X, who use Second Pair to answer and keep
 * the diary" on every email the product sends, so the most-read sentence we
 * had was an explanation of our own software to somebody checking what time
 * they were in on Thursday. The foot is now the business, signed off, and our
 * name appears nowhere a customer reads.
 */
test("the foot is the business signing off, and never mentions us", () => {
  const html = buildEmail(basic);
  assert.match(html, /Willow &amp; Co/);
  assert.doesNotMatch(html, /Second Pair/);
  /* Their name twice: the letterhead at the top and the signature at the foot. */
  assert.equal(html.match(/Willow &amp; Co/g)?.length, 3);
});

test("a reply is only promised where one would arrive", () => {
  assert.doesNotMatch(buildEmail(basic), /Reply to this email/);
  assert.match(buildEmail({ ...basic, replies: true }), /Reply to this email/);
});

/*
 * The business's own address, never the one replies are addressed to.
 *
 * A reply goes to slug@in.second-pair.com so the assistant can carry the
 * conversation on. That address is ours, and printing it at the foot of a
 * salon's email would have been the same fault wearing a different hat, so
 * the field is named for what it is and the callers pass studio.email.
 */
test("the business's own address is printed, as a link, when there is one", () => {
  const html = buildEmail({ ...basic, contactEmail: "hello@willow.co.uk" });
  assert.match(html, /mailto:hello@willow\.co\.uk/);
  assert.doesNotMatch(buildEmail(basic), /mailto:/);
});

/*
 * The business's name and the customer's words go into markup, and a business
 * called "Bill & Ben's" or a note containing a stray < would otherwise close a
 * tag. Nothing here is trusted, including our own customers' own typing.
 */
test("anything that could close a tag is escaped", () => {
  const html = buildEmail({
    business: 'Bill & Ben\'s <script>alert(1)</script>',
    body: "Hello <b>there</b> & goodbye",
  });
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /<b>there<\/b>/);
  assert.match(html, /&amp;/);
});

test("escapeHtml handles all five", () => {
  assert.equal(escapeHtml(`<>&"'`), "&lt;&gt;&amp;&quot;&#39;");
});

test("blank lines become separate paragraphs, single ones a break", () => {
  const html = buildEmail({ business: "X", body: "One.\n\nTwo.\nStill two." });
  assert.equal((html.match(/<p style="margin:0 0 14px/g) ?? []).length, 2);
  assert.match(html, /Two\.<br>Still two\./);
});

test("the button only appears when there is somewhere to go", () => {
  assert.doesNotMatch(buildEmail(basic), /<a href/);
  const withAction = buildEmail({
    ...basic,
    action: { label: "See your appointment", url: "https://x.test/b/abc" },
  });
  assert.match(withAction, /See your appointment/);
  assert.match(withAction, /https:\/\/x\.test\/b\/abc/);
});

/*
 * Most clients block images by default, so nothing that must be read may live
 * in one. An empty alt is deliberate: a blocked decorative image should leave
 * nothing behind rather than a stray word where a picture was.
 */
test("the picture is decoration and says nothing", () => {
  const html = buildEmail({ ...basic, photoUrl: "https://x.test/p.jpg" });
  assert.match(html, /alt=""/);
  const without = buildEmail(basic);
  assert.doesNotMatch(without, /<img/);
});

test("the policy is theirs, and kept as they typed it", () => {
  const html = buildEmail({ ...basic, policy: "48 hours.\n\n50% after that." });
  assert.match(html, /If you need to cancel/);
  assert.match(html, /white-space:pre-line/);
});

/*
 * Every colour is a literal. A customer's email client has never heard of our
 * CSS variables, and one that slipped through would render as nothing.
 */
test("no CSS variables survive into an email", () => {
  const html = buildEmail({ ...basic, photoUrl: "x", policy: "y", action: { label: "a", url: "b" } });
  assert.doesNotMatch(html, /var\(--/);
});

test("the plain text half carries everything the html does", () => {
  const text = emailText({
    ...basic,
    action: { label: "See your appointment", url: "https://x.test/b/abc" },
    policy: "48 hours.",
  });
  assert.match(text, /See you tomorrow, Marie\./);
  assert.match(text, /https:\/\/x\.test\/b\/abc/);
  assert.match(text, /48 hours\./);
  assert.match(text, /Willow & Co/);
  /* Plain text, so nothing is escaped into entities in it. */
  assert.doesNotMatch(text, /&amp;/);
});
