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

/*
 * ── The empty time ──────────────────────────────────────────────────────────
 *
 * Giles, 21 October: "the daily diary needs to look better, more like a
 * diary." What made it a list rather than a day is that it drew every
 * appointment with the same space between them, so four hours of nothing in
 * the middle of a Tuesday looked exactly like two jobs back to back. The gaps
 * are the half of a diary an owner can sell.
 */
test("the hole in the middle of the day is drawn, not skipped over", () => {
  const html = dailyBriefHtml(
    [
      booking({ starts_at: "2026-10-16T09:00:00Z", ends_at: "2026-10-16T10:00:00Z" }),
      booking({ starts_at: "2026-10-16T13:00:00Z", ends_at: "2026-10-16T14:00:00Z" }),
    ],
    about,
  );
  assert.match(html, /3 hours free/);
  assert.match(html, /3 hours free in between/);
});

test("turning round between two jobs is not announced as free time", () => {
  const html = dailyBriefHtml(
    [
      booking({ starts_at: "2026-10-16T09:00:00Z", ends_at: "2026-10-16T10:00:00Z" }),
      booking({ starts_at: "2026-10-16T10:15:00Z", ends_at: "2026-10-16T11:00:00Z" }),
    ],
    about,
  );
  assert.doesNotMatch(html, /free/);
});

/*
 * A double booking is a thing that happens, and the arithmetic that finds a
 * gap is the arithmetic that gets it wrong: comparing each appointment with
 * the one before would make an overlap a negative gap, and the one after that
 * would then be measured from a start time that had already passed.
 */
test("a double booking does not invent hours of free time after it", () => {
  const html = dailyBriefHtml(
    [
      booking({ starts_at: "2026-10-16T09:00:00Z", ends_at: "2026-10-16T17:00:00Z" }),
      booking({ starts_at: "2026-10-16T10:00:00Z", ends_at: "2026-10-16T11:00:00Z" }),
      booking({ starts_at: "2026-10-16T11:30:00Z", ends_at: "2026-10-16T12:00:00Z" }),
    ],
    about,
  );
  assert.doesNotMatch(html, /free/);
});

test("the head of the day says when it starts and ends and how full it is", () => {
  const html = dailyBriefHtml(
    [
      booking({ starts_at: "2026-10-16T09:00:00Z", ends_at: "2026-10-16T10:00:00Z" }),
      booking({ starts_at: "2026-10-16T13:00:00Z", ends_at: "2026-10-16T14:30:00Z" }),
    ],
    about,
  );
  assert.match(html, /10am to 3:30pm|10am to 2:30pm/);
  assert.match(html, /2 hours 30 minutes booked/);
});

/*
 * The diary on screen colours a card by what kind of thing it is, and the
 * mapping from ten categories onto four colours lives in lib/calendar. The
 * first draft of this kept its own copy keyed on the colour names rather than
 * the category names, so a school run and a client appointment came out the
 * same blue.
 */
test("time off is not coloured as client work", () => {
  const client = dailyBriefHtml([booking({ category: "appointment" })], about);
  const off = dailyBriefHtml([booking({ category: "personal" })], about);
  assert.match(client, /#1f3be3/);
  assert.match(off, /#7b8598/);
  assert.doesNotMatch(off, /background:#1f3be3/);
});

test("the way back into the diary is offered only when there is one to offer", () => {
  assert.doesNotMatch(dailyBriefHtml([booking()], about), /Open the diary/);
  assert.match(
    dailyBriefHtml([booking()], { ...about, diaryUrl: "https://www.second-pair.com/diary" }),
    /Open the diary/,
  );
});
