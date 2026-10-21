import { test } from "node:test";
import assert from "node:assert/strict";
import { reportLetterHtml, type ReportLetter } from "./reportLetter.ts";

/*
 * buildReportEmail itself reads eight tables and cannot be tested without a
 * database, which is why it never was. The layout can be, and the layout is
 * where a figure goes missing: every section here is conditional, so the
 * quiet failure is a report that silently stops carrying the row somebody
 * needed. These are the rows, and that every one of them arrives.
 */
const full: ReportLetter = {
  business: "Willow & Co",
  title: "Last week",
  period: "12 October to 18 October",
  tiles: [
    { value: "9", label: "enquiries" },
    { value: "2", label: "booked in" },
    { value: "£700", label: "of work booked" },
  ],
  money: [
    { label: "Taken", value: "£0", note: "nothing was recorded as paid" },
    { label: "Not paid yet", value: "£240", note: "2 payment links", bad: true },
  ],
  week: [{ label: "Enquiries that booked", value: "22%", note: "2 of 9" }],
  notes: ["Most of the work was in TQ12."],
  lapsed: [{ name: "Abbey Beale", detail: "Last in 21 days ago" }],
  ahead: "8 hours free in the week ahead that could be filled.",
  reportUrl: "https://www.second-pair.com/report",
};

test("every figure it was given arrives in the letter", () => {
  const html = reportLetterHtml(full);
  for (const want of [
    "Willow &amp; Co",
    "Last week",
    "12 October to 18 October",
    "£700",
    "Taken",
    "Not paid yet",
    "£240",
    "2 payment links",
    "Enquiries that booked",
    "22%",
    "2 of 9",
    "Most of the work was in TQ12.",
    "Abbey Beale",
    "8 hours free",
    "https://www.second-pair.com/report",
  ]) {
    assert.ok(html.includes(want), `the letter dropped ${want}`);
  }
});

/*
 * A quiet week is the common case for a one-person business, and it is the
 * one a layout built against a busy week breaks on: an empty section leaving
 * a heading with nothing under it reads as something having gone wrong.
 */
test("a week with nothing in it leaves no empty headings behind", () => {
  const html = reportLetterHtml({
    ...full,
    money: [],
    week: [],
    notes: [],
    lapsed: [],
    ahead: null,
  });
  assert.doesNotMatch(html, /THE MONEY|The money/);
  assert.doesNotMatch(html, /The week/);
  assert.doesNotMatch(html, /Worth a message/);
  /* The heading, the tiles and the way back to the full thing still stand. */
  assert.match(html, /Last week/);
  assert.match(html, /Open the full report/);
});

test("money that has not arrived is marked, and money that has is not", () => {
  const html = reportLetterHtml(full);
  const owed = html.indexOf("Not paid yet");
  const taken = html.indexOf("Taken");
  /* The red is on the row that is a problem, and only that one. */
  assert.ok(html.slice(owed, owed + 600).includes("#a8321f"));
  assert.ok(!html.slice(taken, owed).includes("#a8321f"));
});

/*
 * The business's name and a customer's name go into markup, and a salon
 * called "Bill & Ben's" would otherwise close a tag. Same rule as the rest of
 * the emails: nothing is trusted, including our own clients' typing.
 */
test("anything that could close a tag is escaped", () => {
  const html = reportLetterHtml({
    ...full,
    business: "Bill & Ben's <script>alert(1)</script>",
    lapsed: [{ name: "<b>Abbey</b>", detail: "& co" }],
  });
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /<b>Abbey<\/b>/);
});

/*
 * An email client has no idea what our CSS variables are, so a var() that
 * slipped in would render as nothing at all rather than as the wrong colour.
 */
test("no CSS variables survive into an email", () => {
  assert.doesNotMatch(reportLetterHtml(full), /var\(--/);
});

test("a typeface is named, because Outlook's default is a serif", () => {
  assert.match(reportLetterHtml(full), /font-family:[^"]*sans-serif/);
});
