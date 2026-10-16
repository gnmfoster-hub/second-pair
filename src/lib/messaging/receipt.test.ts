import { test } from "node:test";
import assert from "node:assert/strict";
import { composeReceipt, shortRef, type ReceiptLine } from "./receipt.ts";

const base = {
  businessName: "Willow & Co",
  amountPence: 3800,
  paidAt: "2026-09-14T14:42:00.000Z",
  timezone: "Europe/London",
  kind: "product" as string | null,
  description: null as string | null,
  contactName: "Jane Adeyemi" as string | null,
  reference: "8f3a21c9-4d5e-4f6a-b7c8-9d0e1f2a3b4c",
  items: [] as ReceiptLine[],
  vat: null as { ratePercent: number; number: string | null } | null,
};

const receipt = (over: Partial<typeof base> = {}) => composeReceipt({ ...base, ...over });

// ────────────────────────────────────────────────────────────── the basics

test("it greets them by first name", () => {
  assert.match(receipt().text, /^Hello Jane,/);
});

test("somebody with no name on file is still written to", () => {
  assert.match(receipt({ contactName: null }).text, /^Hello there,/);
});

test("the subject carries the amount and the business", () => {
  // Commas, not long dashes. This is read in a list of forty.
  assert.equal(receipt().subject, "Receipt, £38.00, Willow & Co");
});

test("a deposit says so, in the subject and in the words", () => {
  const r = receipt({ kind: "deposit" });
  assert.match(r.subject, /^Deposit received/);
  assert.match(r.text, /comes off the total on the day/);
});

test("and a payment does not talk about deposits", () => {
  assert.doesNotMatch(receipt().text, /deposit/i);
});

// ──────────────────────────────────────────────────────── what it was for

test("with lines, each one is priced by quantity", () => {
  const r = receipt({
    items: [
      { name: "Silver Shampoo", quantity: 2, unitPence: 1200 },
      { name: "Conditioner", quantity: 1, unitPence: 1400 },
    ],
  });
  assert.match(r.text, /2 x Silver Shampoo/);
  assert.match(r.text, /£24\.00/);
  assert.match(r.text, /£14\.00/);
});

test("the total is the payment, not the sum of the lines we happen to hold", () => {
  /*
   * A payment whose breakdown failed to save still shows what left their
   * account. Adding the lines up instead would show £24 on a £38 receipt and
   * look like the salon had overcharged them.
   */
  const r = receipt({ items: [{ name: "Silver Shampoo", quantity: 2, unitPence: 1200 }] });
  assert.match(r.text, /Paid[\s\S]*£38\.00/);
});

test("the amounts line up under each other", () => {
  const r = receipt({
    items: [
      { name: "A very long product name indeed", quantity: 1, unitPence: 1200 },
      { name: "Short", quantity: 1, unitPence: 2600 },
    ],
  });
  const at = r.text
    .split("\n")
    .filter((l) => l.includes("£"))
    .map((l) => l.indexOf("£"));
  assert.equal(new Set(at).size, 1);
});

test("with no lines it falls back to what the business called it", () => {
  assert.match(receipt({ description: "Balance for Friday" }).text, /Balance for Friday: £38\.00/);
});

test("and to something honest when it was never described", () => {
  assert.match(receipt().text, /Payment: £38\.00/);
  assert.match(receipt({ kind: "deposit" }).text, /Deposit: £38\.00/);
});

// ──────────────────────────────────────────────────────────────────── VAT

test("a business that is not registered says nothing about VAT", () => {
  assert.doesNotMatch(receipt().text, /VAT/);
});

/*
 * The VAT inside £38 at 20% is £6.33, not £7.60. Getting this the wrong way
 * round overstates it on a document somebody hands to an accountant.
 */
test("VAT is the part inside what they paid, not a fifth on top", () => {
  const r = receipt({ vat: { ratePercent: 20, number: null } });
  assert.match(r.text, /Includes VAT at 20% \(£6\.33\)/);
});

test("the number is shown when there is one", () => {
  const r = receipt({ vat: { ratePercent: 20, number: "GB123456789" } });
  assert.match(r.text, /VAT number GB123456789\./);
});

test("a zero payment claims no VAT on nothing", () => {
  const r = receipt({ amountPence: 0, vat: { ratePercent: 20, number: null } });
  assert.doesNotMatch(r.text, /Includes VAT/);
});

// ────────────────────────────────────────────────── when, and which one

test("the date is in the business's own timezone", () => {
  // 14:42 UTC in September is 15:42 in London.
  assert.match(receipt().text, /Monday, 14 September 2026 at 3:42 pm/);
});

test("the reference is short enough to read down the phone", () => {
  assert.match(receipt().text, /Reference 8F3A21C9\./);
  assert.equal(shortRef("8f3a21c9-4d5e-4f6a-b7c8-9d0e1f2a3b4c"), "8F3A21C9");
});

test("it signs off as the business, never as us", () => {
  const r = receipt();
  assert.match(r.text, /Willow & Co$/);
  assert.doesNotMatch(r.text, /Second Pair/);
});


/*
 * The one email somebody may forward to an accountant, which went out as
 * plain text with the figures padded into a column by hand until 16 October.
 */
test("it is laid out as well as written", () => {
  const { html } = receipt();
  assert.match(html, /<!doctype html>/i);
  assert.match(html, /Receipt/);
  // What it was for on the left, what it cost on the right, in a column.
  assert.match(html, /text-align:right/);
  assert.match(html, /Paid<\/td>/);
  assert.match(html, /Reference<\/td>/);
});

test("VAT is shown only for a business that is registered", () => {
  assert.doesNotMatch(receipt({ vat: null }).html, /VAT/);
  const reg = receipt({ vat: { ratePercent: 20, number: "GB123456789" } });
  assert.match(reg.html, /20% included/);
  assert.match(reg.html, /GB123456789/);
});

test("no long dash anywhere on a financial document", () => {
  const r = receipt({ vat: { ratePercent: 20, number: "GB1" } });
  for (const [what, value] of Object.entries(r)) {
    assert.doesNotMatch(String(value), /[—–]/, `${what} still has one`);
  }
});
