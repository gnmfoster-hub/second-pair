import { test } from "node:test";
import assert from "node:assert/strict";
import { judge, readEmail, readInboundMode } from "./inboundEmail.ts";

/**
 * The safeguard for a business with one address for everything.
 *
 * Forwarding a whole mailbox to an assistant that answers anything a person
 * wrote means it replies to the accountant, the supplier and the sister — in
 * the business's name, about cleaning. These fix the rule that stops it.
 */

const firm = {
  ownDomains: [],
  ourDomain: "second-pair.com",
  answerTo: ["info@neatandtidysolutions.co.uk"],
};

/** As it arrives once a whole mailbox is being forwarded to us. */
const forwarded = (to: string, subject = "Hello", body = "Are you free Thursday?") =>
  readEmail({
    data: {
      from: "jo@gmail.com",
      to: [to],
      received_for: ["neat-tidy-solutions@in.second-pair.com"],
      subject,
      text: body,
    },
  })!;

test("with no mode set, it answers as it always did", () => {
  const v = judge(forwarded("info@neatandtidysolutions.co.uk"), { ourDomain: "second-pair.com" });
  assert.equal(v.what, "answer");
});

test("listed: a customer writing to the public address is answered", () => {
  const v = judge(forwarded("info@neatandtidysolutions.co.uk"), { ...firm, mode: "listed" });
  assert.equal(v.what, "answer");
});

/*
 * The whole point. Same sender, same forwarding, same address at our end —
 * and it must not be answered, because it was not written to the business's
 * public address.
 */
test("listed: mail to the owner's private address is filed, not answered", () => {
  const v = judge(forwarded("karen@neatandtidysolutions.co.uk"), { ...firm, mode: "listed" });
  assert.equal(v.what, "park");
  assert.match(v.because, /not sent to a public address/);
});

test("listed: cc'ing the public address still counts", () => {
  const email = readEmail({
    data: {
      from: "jo@gmail.com",
      to: ["karen@neatandtidysolutions.co.uk"],
      cc: ["info@neatandtidysolutions.co.uk"],
      received_for: ["neat-tidy-solutions@in.second-pair.com"],
      subject: "Quote",
      text: "How much for a deep clean?",
    },
  })!;
  assert.equal(judge(email, { ...firm, mode: "listed" }).what, "answer");
});

/*
 * A business that picked "listed" and never named an address has not finished
 * setting up. Answering everything would be the opposite of what they asked
 * for, so nothing is answered and the reason says so.
 */
test("listed with nothing listed answers nothing, and says why", () => {
  const v = judge(forwarded("info@neatandtidysolutions.co.uk"), {
    ...firm,
    mode: "listed",
    answerTo: [],
  });
  assert.equal(v.what, "park");
  assert.match(v.because, /no public address/);
});

test("none: everything is filed for a person", () => {
  const v = judge(forwarded("info@neatandtidysolutions.co.uk"), { ...firm, mode: "none" });
  assert.equal(v.what, "park");
});

/*
 * The mode may only ever hold something back. If it could promote, a business
 * that listed an address would start getting newsletters answered.
 */
test("no mode can turn a newsletter into an enquiry", () => {
  const junk = readEmail({
    data: {
      from: "news@supplier.com",
      to: ["info@neatandtidysolutions.co.uk"],
      received_for: ["neat-tidy-solutions@in.second-pair.com"],
      subject: "Our September offers",
      text: "Big savings on mops.",
      headers: { "List-Unsubscribe": "<https://supplier.com/unsub>" },
    },
  })!;

  for (const mode of ["all", "listed", "none"] as const) {
    assert.equal(judge(junk, { ...firm, mode }).what, "ignore", `mode ${mode}`);
  }
});

test("a verification code still gets through every mode", () => {
  const code = readEmail({
    data: {
      from: "forwarding-noreply@google.com",
      to: ["karen@neatandtidysolutions.co.uk"],
      received_for: ["neat-tidy-solutions@in.second-pair.com"],
      subject: "(#123456789) Gmail Forwarding Confirmation",
      text: "Your confirmation code is 123456789.",
    },
  })!;

  for (const mode of ["all", "listed", "none"] as const) {
    const v = judge(code, { ...firm, mode });
    assert.equal(v.what, "park", `mode ${mode}`);
    assert.match(v.because, /code/);
  }
});

test("the address it reached us by is not treated as who it was for", () => {
  const email = forwarded("info@neatandtidysolutions.co.uk");
  assert.ok(!email.sentTo?.some((a) => a.endsWith("@in.second-pair.com")));
});

test("an unrecognised mode is read as the safe default, not a crash", () => {
  assert.equal(readInboundMode("nonsense"), "all");
  assert.equal(readInboundMode(undefined), "all");
  assert.equal(readInboundMode("listed"), "listed");
});
