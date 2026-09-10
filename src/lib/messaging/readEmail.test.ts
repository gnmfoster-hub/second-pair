import { test } from "node:test";
import assert from "node:assert/strict";
import { readEmail, ourRecipient } from "./inboundEmail.ts";

/**
 * Working out whose email this is.
 *
 * The format belongs to somebody else, which makes this the piece most likely
 * to break without anybody touching it. The failure is always the same shape:
 * a field renamed at their end, nothing thrown, and a customer's enquiry
 * quietly dropped.
 */

const OURS = "in.second-pair.com";

/*
 * Resend's own documented payload for email.received, field for field.
 * Note what is not in it: no text, no html, no headers.
 */
const RESEND = {
  type: "email.received",
  created_at: "2026-09-11T09:14:12.126Z",
  data: {
    email_id: "56761188-7520-42d8-8898-ff6fc54ce618",
    from: "jo@gmail.com",
    to: ["hello@neatandtidysolutions.co.uk"],
    cc: [],
    bcc: [],
    received_for: ["neat-tidy-solutions@in.second-pair.com"],
    message_id: "<111-222-333@mail.gmail.com>",
    subject: "Quote for an end of tenancy clean",
  },
};

/*
 * The one that would have lost the enquiry.
 *
 * A business forwards its own address to ours, so the To line still says
 * theirs. Reading only To takes "hello" for the slug, finds no such business,
 * and drops it without a word.
 */
test("a forwarded email is matched on the address it was delivered to", () => {
  const email = readEmail(RESEND);
  assert.ok(email);
  const mine = ourRecipient(email.to ?? "", OURS);
  assert.equal(mine, "neat-tidy-solutions@in.second-pair.com");
  assert.equal(mine?.split("@")[0], "neat-tidy-solutions");
});

test("a straight email with no forwarding still works", () => {
  const email = readEmail({
    data: {
      from: "jo@gmail.com",
      to: ["living-canvas-tattoo-nxst@in.second-pair.com"],
      subject: "Forearm piece",
      text: "How much for a forearm piece?",
    },
  });
  assert.ok(email);
  assert.equal(
    ourRecipient(email.to ?? "", OURS),
    "living-canvas-tattoo-nxst@in.second-pair.com",
  );
  assert.equal(email.body, "How much for a forearm piece?");
});

test("Resend's own payload carries no body, and says so honestly", () => {
  const email = readEmail(RESEND);
  assert.ok(email);
  assert.equal(email.subject, "Quote for an end of tenancy clean");
  // The route parks rather than answering when this is empty. Answering on a
  // subject line alone is the business looking like it did not read the email.
  assert.ok(!email.body);
});

test("an email with only markup comes back as words", () => {
  const email = readEmail({
    data: {
      from: "jo@gmail.com",
      to: ["neat-tidy-solutions@in.second-pair.com"],
      html: "<p>Hello,</p><p>Can you do a <b>deep clean</b>?</p>",
    },
  });
  assert.ok(email?.body);
  assert.match(email.body, /deep clean/);
  assert.doesNotMatch(email.body, /<[a-z]/i);
});

test("a flat payload, not nested under data, is read the same", () => {
  const email = readEmail({
    from: "jo@gmail.com",
    to: "neat-tidy-solutions@in.second-pair.com",
    subject: "Hello",
    text: "Are you free Thursday?",
  });
  assert.ok(email);
  assert.equal(email.body, "Are you free Thursday?");
});

test("headers arrive as a list or an object, and read the same either way", () => {
  const asList = readEmail({
    data: {
      from: "a@b.com",
      to: ["x@in.second-pair.com"],
      headers: [{ name: "List-Unsubscribe", value: "<https://x/unsub>" }],
    },
  });
  const asObject = readEmail({
    data: {
      from: "a@b.com",
      to: ["x@in.second-pair.com"],
      headers: { "list-unsubscribe": "<https://x/unsub>" },
    },
  });
  assert.equal(asList?.headers?.["list-unsubscribe"], "<https://x/unsub>");
  assert.equal(asObject?.headers?.["list-unsubscribe"], "<https://x/unsub>");
});

test("nothing that could be a sender means nothing to read", () => {
  assert.equal(readEmail({ data: { subject: "hi" } }), null);
});

/*
 * Our own address wins wherever it appears. A customer who cc's the business
 * and us must not be filed under the business's own domain.
 */
test("our address is preferred over everybody else's on the line", () => {
  const email = readEmail({
    data: {
      from: "jo@gmail.com",
      to: ["hello@theirfirm.co.uk", "someone@else.com"],
      cc: ["neat-tidy-solutions@in.second-pair.com"],
    },
  });
  assert.equal(ourRecipient(email?.to ?? "", OURS), "neat-tidy-solutions@in.second-pair.com");
});
