import { test } from "node:test";
import assert from "node:assert/strict";
import { dailyBriefHtml } from "./dailyBriefEmail.ts";
import type { BriefBooking } from "./dailyBrief.ts";

const LONDON = "Europe/London";
const DAY = "2026-10-16T09:00:00Z";

function booking(over: Partial<BriefBooking> = {}): BriefBooking {
  return {
    starts_at: "2026-10-16T09:00:00Z",
    ends_at: "2026-10-16T10:00:00Z",
    all_day: false,
    title: "Group walk",
    notes: null,
    price_pence: 1400,
    category: "appointment",
    who: "Amber Hurden",
    client: "Julie Koch",
    phone: "07700 900123",
    deposit_amount_pence: 0,
    deposit_status: "paid",
    ...over,
  };
}

const about = { day: DAY, timeZone: LONDON, business: "Amber's Paws & Pastures" };

test("it is a table, because an email has no grid to lay a diary out with", () => {
  const html = dailyBriefHtml([booking()], about);
  assert.match(html, /role="presentation"/);
  // The rail down the left of the content column is what makes it read as a day.
  assert.match(html, /border-left:1px solid/);
});

test("every email the product sends should name a typeface, and this one does", () => {
  // Nothing in the shared builder set one for months, so Outlook rendered
  // every email in Times New Roman.
  const html = dailyBriefHtml([booking()], about);
  assert.match(html, /font-family:-apple-system/);
  assert.doesNotMatch(html, /font-family:\s*;/);
});

test("the times are the business's own, said the way a person says them", () => {
  // 09:00Z in October is ten in the morning in London.
  const html = dailyBriefHtml([booking()], about);
  assert.match(html, /10am/);
  assert.match(html, /11am/);
});

test("the day is named in full at the top, with what it comes to", () => {
  const html = dailyBriefHtml([booking(), booking({ price_pence: 2600 })], about);
  assert.match(html, /Friday 16 October/);
  assert.match(html, /2 appointments/);
  assert.match(html, /£40<\/span> booked in/);
});

test("a quiet day says so rather than arriving empty", () => {
  const html = dailyBriefHtml([], about);
  assert.match(html, /Nothing booked/);
  assert.match(html, /Nothing in the diary today/);
});

test("the phone number can be tapped, and reads the way people write it", () => {
  const html = dailyBriefHtml([booking()], about);
  assert.match(html, /href="tel:07700900123"/);

  // Stored as +447780575834, which is correct and is not what anybody reads.
  const stored = dailyBriefHtml([booking({ phone: "+447780575834" })], about);
  assert.match(stored, /href="tel:\+447780575834"/, "the link keeps the dialable form");
  assert.match(stored, />07780 575834</, "the writing is the human form");
});

test("a deposit still owed is marked, and a paid one is not mentioned", () => {
  const owed = dailyBriefHtml(
    [booking({ deposit_amount_pence: 2000, deposit_status: "unpaid" })],
    about,
  );
  assert.match(owed, /Deposit of £20 not paid/);

  const paid = dailyBriefHtml(
    [booking({ deposit_amount_pence: 2000, deposit_status: "paid" })],
    about,
  );
  assert.doesNotMatch(paid, /Deposit/);
});

test("all-day things come first, because the day sits inside them", () => {
  const html = dailyBriefHtml(
    [booking({ title: "Nine o'clock" }), booking({ all_day: true, title: "Away", price_pence: null })],
    about,
  );
  assert.ok(html.indexOf("Away") < html.indexOf("Nine o&#39;clock"));
  assert.match(html, /All day/);
});

test("whose it is, only where there is more than one of them", () => {
  assert.doesNotMatch(dailyBriefHtml([booking()], about), /Amber Hurden/);
  assert.match(dailyBriefHtml([booking()], { ...about, manyPeople: true }), /Amber Hurden/);
});

/*
 * Everything in here comes out of a database that a customer typed into.
 * A name with a bracket in it broke the initials on the launcher this week;
 * a name with a tag in it would be worse than broken.
 */
test("nothing a customer typed can become markup", () => {
  const html = dailyBriefHtml(
    [
      booking({
        title: '<script>alert("x")</script>',
        client: "Jo & Sons <b>",
        notes: "Gate code <4821>",
      }),
    ],
    about,
  );
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /Jo &amp; Sons &lt;b&gt;/);
  assert.match(html, /Gate code &lt;4821&gt;/);
});

test("a note keeps the lines somebody typed", () => {
  const html = dailyBriefHtml([booking({ notes: "Gate code 4821.\nNervous of bikes." })], about);
  assert.match(html, /Gate code 4821\.<br>Nervous of bikes\./);
});

test("no long dashes, the same as everything else a person reads", () => {
  assert.doesNotMatch(dailyBriefHtml([booking()], about), /[—–]/);
});
