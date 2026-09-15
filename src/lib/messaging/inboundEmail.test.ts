import { test } from "node:test";
import assert from "node:assert/strict";
import { judge, domainOf, ourRecipient, plainTextFrom } from "./inboundEmail.ts";

const shop = { ownDomains: ["livingcanvastattoo.ink"], ourDomain: "second-pair.com" };

test("an ordinary enquiry is answered", () => {
  const v = judge(
    { from: "Jo Marsh <jo@gmail.com>", subject: "Tattoo quote", body: "How much for a forearm piece?" },
    shop,
  );
  assert.equal(v.what, "answer");
});

/*
 * The whole reason this exists. Everything below is something a small business
 * receives every week, and an assistant that replied to any of it would be
 * worse than no assistant at all.
 */
test("a mailing list is never answered", () => {
  const ways: Record<string, string>[] = [
    { "list-unsubscribe": "<https://x/unsub>" },
    { "list-id": "news.example.com" },
    { precedence: "bulk" },
  ];
  for (const headers of ways) {
    const v = judge({ from: "news@supplier.com", subject: "October offers", headers }, shop);
    assert.equal(v.what, "ignore", JSON.stringify(headers));
  }
});

test("an automatic message is never answered", () => {
  const v = judge(
    { from: "someone@else.com", subject: "Re: your order", headers: { "auto-submitted": "auto-generated" } },
    shop,
  );
  assert.equal(v.what, "ignore");
});

test("an out of office is not a customer", () => {
  assert.equal(judge({ from: "bob@firm.com", subject: "Out of Office: re your invoice" }, shop).what, "ignore");
  assert.equal(judge({ from: "bob@firm.com", subject: "Automatic reply: away" }, shop).what, "ignore");
});

test("a bounce is not a customer", () => {
  assert.equal(judge({ from: "MAILER-DAEMON@mx.google.com", subject: "Undeliverable" }, shop).what, "ignore");
  assert.equal(
    judge({ from: "x@y.com", subject: "Delivery Status Notification (Failure)" }, shop).what,
    "ignore",
  );
});

test("an address that does not take replies is not written to", () => {
  for (const from of [
    "no-reply@stripe.com",
    "noreply@bank.co.uk",
    "donotreply@hmrc.gov.uk",
    "notifications@calendar.google.com",
    "invoices@wholesaler.com",
  ]) {
    assert.equal(judge({ from, subject: "Your statement" }, shop).what, "ignore", from);
  }
});

/*
 * A loop of our own making. The reply leaves from our domain, so one wrong
 * forwarding rule and the assistant answers itself until somebody notices the
 * bill.
 */
test("a message from the assistant itself is ignored", () => {
  const v = judge({ from: "hello@second-pair.com", subject: "Re: your appointment" }, shop);
  assert.equal(v.what, "ignore");
  assert.match(v.because, /assistant/);
});

test("the business writing in is parked, not answered", () => {
  const v = judge({ from: "dave@livingcanvastattoo.ink", subject: "fwd: a question" }, shop);
  assert.equal(v.what, "park");
  assert.match(v.because, /inside the business/);
});

test("an empty message is parked rather than guessed at", () => {
  assert.equal(judge({ from: "jo@gmail.com", subject: "", body: "  " }, shop).what, "park");
});

test("no sender at all is ignored", () => {
  assert.equal(judge({ from: "", subject: "hello" }, shop).what, "ignore");
  assert.equal(judge({ from: "not-an-address", subject: "hello" }, shop).what, "ignore");
});

test("the address is read out of a display name", () => {
  assert.equal(domainOf("Jo Marsh <jo@gmail.com>"), "gmail.com");
  assert.equal(domainOf("jo@gmail.com"), "gmail.com");
  assert.equal(domainOf("nonsense"), "");
});

/*
 * Case and spacing come from whatever wrote the message, which is a hundred
 * different mail clients and none of them agree.
 */
test("headers and addresses are matched however they are written", () => {
  assert.equal(
    judge({ from: "Dave <DAVE@LivingCanvasTattoo.Ink>", subject: "hello" }, shop).what,
    "park",
  );
  assert.equal(
    judge({ from: "x@y.com", subject: "hi", headers: { "Auto-Submitted": "auto-replied" } }, shop).what,
    "ignore",
  );
});

test("auto-submitted: no is a person, and is answered", () => {
  const v = judge(
    { from: "jo@gmail.com", subject: "Booking", body: "can I come in Friday?", headers: { "auto-submitted": "no" } },
    shop,
  );
  assert.equal(v.what, "answer");
});

/*
 * Picking our own address out of a To line.
 *
 * Taking the first address and splitting on "@" gave "the fold hair <demo-fold"
 * the moment a provider included a display name, and the enquiry was dropped as
 * belonging to no business at all — silently, because a dropped email leaves
 * nothing behind to notice.
 */
test("a display name does not become part of the business name", () => {
  assert.equal(
    ourRecipient("The Fold Hair <demo-fold@in.second-pair.com>", "in.second-pair.com"),
    "demo-fold@in.second-pair.com",
  );
});

test("ours is found among several recipients", () => {
  assert.equal(
    ourRecipient("jo@gmail.com, The Fold <demo-fold@in.second-pair.com>", "in.second-pair.com"),
    "demo-fold@in.second-pair.com",
  );
  assert.equal(
    ourRecipient("demo-fold@in.second-pair.com, partner@gmail.com", "in.second-pair.com"),
    "demo-fold@in.second-pair.com",
  );
});

test("a plain address still works", () => {
  assert.equal(ourRecipient("demo-fold@in.second-pair.com", "in.second-pair.com"), "demo-fold@in.second-pair.com");
});

test("none of ours falls back to the first rather than dropping it", () => {
  assert.equal(ourRecipient("someone@elsewhere.com", "in.second-pair.com"), "someone@elsewhere.com");
  assert.equal(ourRecipient("", "in.second-pair.com"), null);
});

/*
 * Plenty of mail has no plain-text part. Handed the markup, the assistant reads
 * a wall of tags and can quote them back at a customer.
 */
test("an HTML-only message comes out as words", () => {
  const html =
    "<html><head><style>p{color:red}</style></head><body>" +
    "<p>Hi &amp; hello</p><p>How much for a <b>forearm</b> piece?</p>" +
    "<script>alert(1)</script></body></html>";
  const text = plainTextFrom(html);
  assert.match(text, /Hi & hello/);
  assert.match(text, /How much for a forearm piece\?/);
  assert.ok(!text.includes("<"), text);
  assert.ok(!text.includes("alert"), text);
  assert.ok(!text.includes("color:red"), text);
});

test("line breaks survive, runs of blank lines do not", () => {
  assert.equal(plainTextFrom("<p>one</p><p>two</p>"), "one\ntwo");
  assert.equal(plainTextFrom("a<br><br><br><br>b"), "a\n\nb");
});

test("nothing but markup comes out empty", () => {
  assert.equal(plainTextFrom("<div><span></span></div>"), "");
});

/*
 * The message an owner is actually waiting for.
 *
 * Setting up forwarding means proving you control the address it forwards to,
 * and every provider does that by sending a code there. It arrives from a
 * no-reply sender, marked automatic — the exact shape of everything this file
 * throws away. So the one email somebody is sitting waiting for was the one
 * most certain to be binned.
 */
test("a forwarding confirmation reaches the owner", () => {
  const v = judge(
    {
      from: "forwarding-noreply@google.com",
      subject: "(#123456) Gmail Forwarding Confirmation - Receive Mail from dave@livingcanvastattoo.ink",
      body: "You have requested to automatically forward mail. Confirmation code: 123456",
      headers: { "auto-submitted": "auto-generated" },
    },
    shop,
  );
  assert.equal(v.what, "park");
  assert.match(v.because, /setting this address up/);
});

test("a verification code from anywhere reaches the owner", () => {
  for (const subject of [
    "Your verification code is 448122",
    "Confirmation code for your new address",
    "Verify your email address to continue",
  ]) {
    const v = judge({ from: "no-reply@example.com", subject, headers: { precedence: "bulk" } }, shop);
    assert.equal(v.what, "park", subject);
  }
});

/*
 * And the other direction, which matters more: a customer using those words
 * must still be answered rather than left sitting in the inbox.
 */
test("a customer who says confirm or verify is still answered", () => {
  for (const [subject, body] of [
    ["Appointment", "Can you confirm by email please?"],
    ["Hi", "Just confirming my appointment on Thursday"],
    ["Quote", "Could you verify the price you gave me?"],
    ["Booking", "please confirm this address is right: 14 Mill Lane"],
  ] as [string, string][]) {
    assert.equal(judge({ from: "jo@gmail.com", subject, body }, shop).what, "answer", body);
  }
});


// ───────────────────────────────────────────── a subject is not a message

/*
 * Found live: an email to Neat & Tidy with the subject "testing mailbox" and
 * an empty body got a reply. The rule required subject AND body to be empty,
 * so a subject on its own counted as something to answer.
 *
 * It is the commonest shape of mail a business address receives that is not a
 * customer — a test, a forward with the note stripped, a "FYI" where the
 * attachment was the whole point.
 */
test("a subject with no body is not answered", () => {
  const v = judge({ from: "jo@gmail.com", subject: "testing mailbox", body: "" }, shop);
  assert.equal(v.what, "park");
});

test("nothing at all is not answered either", () => {
  const v = judge({ from: "jo@gmail.com", subject: "", body: "" }, shop);
  assert.equal(v.what, "park");
});

/*
 * Parked, not ignored. A person sent it and a person should see it — ignoring
 * is for machines, and a customer who did put their whole question in the
 * subject line must not vanish.
 */
test("it is parked for a human rather than dropped", () => {
  const v = judge({ from: "jo@gmail.com", subject: "Do you do end of tenancy?", body: "" }, shop);
  assert.equal(v.what, "park");
  assert.notEqual(v.what, "ignore");
});

test("a body with no subject is still a person getting in touch", () => {
  const v = judge(
    { from: "jo@gmail.com", subject: "", body: "Hi, how much for a small tattoo?" },
    shop,
  );
  assert.equal(v.what, "answer");
});

test("whitespace is not a body", () => {
  const v = judge(
    { from: "jo@gmail.com", subject: "Quote please", body: "  \t\n  " },
    shop,
  );
  assert.equal(v.what, "park");
});

// ─────────────────────────────────────── the advert that got a reply

/*
 * Live, on Neat & Tidy. A classified-ads company sent its advert statistics,
 * carried no machine headers at all, and was written back to in the business's
 * own name. The assistant even worked out what it was — and said so, in a
 * reply, to a mailbox nobody reads.
 */
test("a mailing that only mentions unsubscribing is not answered", () => {
  const v = judge(
    {
      from: "freeads@freeads.co.uk",
      subject: "Your Advert Statistics",
      body: "Your advert had 42 views this week. Unsubscribe from these emails.",
    },
    shop,
  );
  // Parked rather than ignored: with no link to go on, this is
  // indistinguishable from a person using the word, and the two are separated
  // by the test below rather than guessed at here.
  assert.equal(v.what, "park");
});

/*
 * And it should not reach the inbox either, which is the half that was
 * reported. Parking a mailing puts it in front of somebody flagged as needing
 * a person — a cleaning directory's listing notice sat at the top of a real
 * business's inbox marked urgent. A bulk sender carries an unsubscribe link; a
 * person types the word. That is the whole of the difference and it is enough.
 */
test("a mailing with an actual link is ignored, not put in the inbox", () => {
  const v = judge(
    {
      from: "featured@cleaners10.com",
      subject: "Listing Notification for Neat & Tidy Solutions",
      body:
        "This is a reminder that your listing is now available on Cleaners10.\n" +
        "To stop receiving these, unsubscribe here: https://cleaners10.com/u/58063568",
    },
    shop,
  );
  assert.equal(v.what, "ignore");
});

test("the link is found whichever side of the word it falls", () => {
  // A flattened anchor puts the address first.
  const flattened = judge(
    {
      from: "ads@example.com",
      subject: "Stats",
      body: "https://example.com/unsubscribe Unsubscribe",
    },
    shop,
  );
  assert.equal(flattened.what, "ignore");

  // A plain-text part puts it after.
  const plain = judge(
    { from: "ads@example.com", subject: "Stats", body: "Unsubscribe: https://example.com/u/9" },
    shop,
  );
  assert.equal(plain.what, "ignore");
});

/*
 * The one that must not be swept up with them: a real customer whose signature
 * happens to carry a link, writing a real enquiry.
 */
test("a customer with a link in their signature is still a customer", () => {
  const v = judge(
    {
      from: "jo@gmail.com",
      subject: "Cleaning quote",
      body: "Hi, how much for a deep clean?\n\nJo\nhttps://www.jomarsh.co.uk",
    },
    shop,
  );
  assert.equal(v.what, "answer");
});

/*
 * Parked, not ignored. Somebody asking a business to stop emailing them is a
 * real thing to say, and it deserves a person rather than silence.
 */
test("a person asking to be taken off a list reaches a human", () => {
  const v = judge(
    {
      from: "jo@gmail.com",
      subject: "",
      body: "Please unsubscribe me from your newsletter, I keep getting it twice.",
    },
    shop,
  );
  assert.equal(v.what, "park");
  assert.notEqual(v.what, "ignore");
});

test("an ordinary enquiry is still answered", () => {
  const v = judge(
    { from: "jo@gmail.com", subject: "Quote", body: "How much for a forearm piece?" },
    shop,
  );
  assert.equal(v.what, "answer");
});

// ───────────────────────────────────── markup, whichever field it arrives in

test("markup under the text field is still turned into words", () => {
  const words = plainTextFrom("<!DOCTYPE html><html><head><style>p{color:red}</style></head><body><p>Hello there</p></body></html>");
  assert.equal(words, "Hello there");
  assert.doesNotMatch(words, /DOCTYPE|color:red/);
});

// ───────────────────────────────────────── somebody selling, not a customer

test("a sales pitch is ignored, for every business, before anything is answered", () => {
  const v = judge(
    {
      from: "kaseefexpert5@gmail.com",
      subject: "Quick question",
      body: "If I bring 30–45 orders to Livingcanvastattoo in September, can we explore a collaboration? What’s the best WhatsApp to connect with you?",
    },
    { ...shop, name: "Living Canvas Tattoo" },
  );
  assert.equal(v.what, "ignore");
  assert.match(v.because, /sales pitch/);
});

test("a verification code still reaches the owner even if it reads like a pitch", () => {
  const v = judge(
    { from: "noreply@zoho.com", subject: "Your confirmation code", body: "Your confirmation code is 123456 to boost your sales tools" },
    { ...shop, name: "Living Canvas Tattoo" },
  );
  assert.equal(v.what, "park");
});

test("mail the provider already marked as spam is ignored", () => {
  assert.equal(judge({ from: "x@gmail.com", subject: "***SPAM*** Re: Audit Errors", body: "Any update?" }, shop).what, "ignore");
  assert.equal(judge({ from: "x@gmail.com", subject: "Hello", body: "Hi", headers: { "X-Spam-Flag": "YES" } }, shop).what, "ignore");
});
