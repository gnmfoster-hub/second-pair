import { test } from "node:test";
import assert from "node:assert/strict";
import { describeSeries, listSeries } from "./series.ts";

const LONDON = "Europe/London";

/* Three November mornings and a Saturday, all at nine, as a run of cat visits. */
const RUN = [
  "2026-11-03T09:00:00.000Z",
  "2026-11-04T09:00:00.000Z",
  "2026-11-05T09:00:00.000Z",
  "2026-11-07T09:00:00.000Z",
];

test("a run is a count and a span, not a list", () => {
  const said = describeSeries(RUN, LONDON);
  assert.match(said, /^4 visits, /);
  assert.match(said, /Tuesday 3 November/);
  assert.match(said, /Saturday 7 November/);
});

/*
 * The whole reason it is a count and a span: it has to fit in a text.
 *
 * Listing four dates with their times is four texts before the sentence around
 * them, and a customer booking a week of visits is exactly the customer a
 * business is sending the most messages to.
 */
test("the summary is short enough to sit in a text", () => {
  assert.ok(describeSeries(RUN, LONDON).length < 70, describeSeries(RUN, LONDON));
});

/*
 * Two is said rather than summarised. "2 visits between Monday and Tuesday" is
 * more words than naming both and tells somebody less.
 */
test("two are named, because summarising two says less than saying them", () => {
  const said = describeSeries(RUN.slice(0, 2), LONDON);
  assert.match(said, / and /);
  assert.doesNotMatch(said, /2 visits/);
});

test("one is just itself, as it always was", () => {
  const said = describeSeries([RUN[0]], LONDON);
  assert.doesNotMatch(said, /visits|and /);
  assert.match(said, /Tuesday 3 November/);
});

/* Nothing at all must not produce the word "undefined" in front of a customer. */
test("nothing gives nothing, rather than a broken sentence", () => {
  assert.equal(describeSeries([], LONDON), "");
  assert.equal(describeSeries(["not a date"], LONDON), "");
  assert.deepEqual(listSeries([], LONDON), []);
});

test("rubbish in the middle is dropped and the rest still counts", () => {
  const said = describeSeries([...RUN, "nonsense"], LONDON);
  assert.match(said, /^4 visits, /);
});

/*
 * Order comes from the dates rather than from the rows.
 *
 * The parent booking and its children are fetched in whatever order the
 * database returns them, so the span would otherwise read backwards for no
 * visible reason.
 */
test("it sorts itself, whatever order the rows arrived in", () => {
  const jumbled = [RUN[3], RUN[0], RUN[2], RUN[1]];
  assert.equal(describeSeries(jumbled, LONDON), describeSeries(RUN, LONDON));
  assert.deepEqual(listSeries(jumbled, LONDON), listSeries(RUN, LONDON));
});

/*
 * The trade's own word. A dog walker books visits; a salon books appointments,
 * and "4 visits" would read as something else entirely in a hairdresser's.
 */
test("it uses the trade's own word for one of them", () => {
  assert.match(describeSeries(RUN, LONDON, "appointment"), /^4 appointments, /);
});

/*
 * The times are deliberately left out of the span and kept in the list.
 *
 * "4 visits between Tuesday 3 November at 9:00 am and Saturday 7 November at
 * 9:00 am" buries the two numbers that matter under two times that are usually
 * identical. Somebody checking a particular day looks at the list.
 */
test("the span carries no times, and the list carries all of them", () => {
  assert.doesNotMatch(describeSeries(RUN, LONDON), /am|pm/);
  const lines = listSeries(RUN, LONDON);
  assert.equal(lines.length, 4);
  for (const line of lines) assert.match(line, /am|pm/);
});

/*
 * A run that crosses the end of British Summer Time.
 *
 * The clocks go back on 25 October 2026. Both of these are nine in the morning
 * where the business is, and an hour apart in UTC — which is exactly the sort of
 * thing that puts a wrong time in front of a customer.
 */
test("it reads the business's own clock across a clock change", () => {
  const across = ["2026-10-24T08:00:00.000Z", "2026-10-26T09:00:00.000Z"];
  const said = describeSeries(across, LONDON);
  assert.match(said, /9:00/);
  assert.equal((said.match(/9:00/g) ?? []).length, 2, said);
});
