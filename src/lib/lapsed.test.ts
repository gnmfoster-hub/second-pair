import { test } from "node:test";
import assert from "node:assert/strict";
import { whoHasNotBeenBack } from "./lapsed.ts";

const NOW = new Date("2026-09-14T12:00:00Z");
const DAY = 86_400_000;

/** A visit this many days before now. */
function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * DAY).toISOString();
}

/** Somebody who comes every `gap` days, `count` times, the last `since` ago. */
function regular(contactId: string, name: string, gap: number, count: number, since: number) {
  return Array.from({ length: count }, (_, i) => ({
    contactId,
    name,
    at: daysAgo(since + (count - 1 - i) * gap),
    pence: 4500,
  }));
}

test("somebody bang on their own rhythm is not overdue", () => {
  // Every 42 days, last in 40 days ago.
  const out = whoHasNotBeenBack(regular("marie", "Marie", 42, 4, 40), NOW);
  assert.equal(out.length, 0);
});

test("the regular who has quietly stopped coming is found", () => {
  // Every 42 days, and it has been 90.
  const out = whoHasNotBeenBack(regular("marie", "Marie", 42, 4, 90), NOW);
  assert.equal(out.length, 1);
  assert.equal(out[0].name, "Marie");
  assert.equal(out[0].usualGapDays, 42);
  assert.equal(out[0].overdueByDays, 48);
  assert.equal(out[0].basis, "their own rhythm");
});

/*
 * The whole reason this is not a ninety-day rule. Both of these are wrong
 * under one, and in opposite directions.
 */
test("a twice-a-year client is not chased for being a twice-a-year client", () => {
  // Every 180 days, last in 150 days ago — early, if anything.
  const out = whoHasNotBeenBack(regular("annie", "Annie", 180, 3, 150), NOW);
  assert.equal(out.length, 0);
});

test("a five-week client who has been gone nine weeks is caught well before ninety days", () => {
  const out = whoHasNotBeenBack(regular("kath", "Kath", 35, 4, 63), NOW);
  assert.equal(out.length, 1);
  assert.equal(out[0].daysSince, 63);
});

test("somebody already booked in is never listed, however long it has been", () => {
  const visits = regular("marie", "Marie", 42, 4, 200);
  assert.equal(whoHasNotBeenBack(visits, NOW).length, 1);
  assert.equal(whoHasNotBeenBack(visits, NOW, { booked: ["marie"] }).length, 0);
});

/*
 * A weekly client is not a lapsed client on day eleven. Without a floor the
 * multiplier alone turns this into a nuisance for exactly the people who come
 * most often.
 */
test("a weekly client is not chased for being a few days late", () => {
  const out = whoHasNotBeenBack(regular("dan", "Dan", 7, 6, 12), NOW);
  assert.equal(out.length, 0);
});

test("but a weekly client gone two months is very much overdue", () => {
  const out = whoHasNotBeenBack(regular("dan", "Dan", 7, 6, 60), NOW);
  assert.equal(out.length, 1);
});

test("somebody who came once is measured against how often people come here", () => {
  const visits = [
    ...regular("marie", "Marie", 40, 4, 10),
    ...regular("kath", "Kath", 40, 4, 10),
    { contactId: "once", name: "Once Only", at: daysAgo(120), pence: 3000 },
  ];
  const out = whoHasNotBeenBack(visits, NOW);
  const only = out.find((l) => l.contactId === "once");
  assert.ok(only, "the one-visit client should be listed");
  assert.equal(only.basis, "how often people come here");
  assert.equal(only.usualGapDays, 40);
  assert.equal(only.visits, 1);
});

/*
 * A business where everybody has been exactly once has no rhythm to measure
 * against, and inventing a number here is the ninety-day rule in a hat.
 */
test("with nothing to measure against, nobody is declared lost", () => {
  const out = whoHasNotBeenBack(
    [
      { contactId: "a", name: "A", at: daysAgo(300) },
      { contactId: "b", name: "B", at: daysAgo(400) },
    ],
    NOW,
  );
  assert.equal(out.length, 0);
});

test("the one furthest past their own rhythm comes first, not the one longest gone", () => {
  const out = whoHasNotBeenBack(
    [
      // Twice a year, gone 14 months: about 2.3x their rhythm.
      ...regular("annie", "Annie", 180, 3, 420),
      // Every 5 weeks, gone 6 months: about 5x theirs.
      ...regular("kath", "Kath", 35, 4, 180),
    ],
    NOW,
  );
  assert.equal(out[0].name, "Kath", "the regular who stopped should outrank the occasional one");
  assert.ok(out[0].daysSince < out[1].daysSince, "even though she has been gone less time");
});

/*
 * A cut and a colour booked back to back are two rows and one visit. Counted
 * as a gap of zero they would drag the median to nothing, and then everybody
 * who has ever had two things done in a day reads as permanently overdue.
 */
test("two appointments on one day are one visit, not a rhythm of zero", () => {
  const out = whoHasNotBeenBack(
    [
      { contactId: "x", name: "X", at: daysAgo(400) },
      { contactId: "x", name: "X", at: daysAgo(400) },
      { contactId: "x", name: "X", at: daysAgo(300) },
    ],
    NOW,
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].usualGapDays, 100, "the same-day pair must not count as a gap");
});

test("what they have been worth comes with them", () => {
  const out = whoHasNotBeenBack(regular("marie", "Marie", 42, 4, 120), NOW);
  assert.equal(out[0].pence, 4 * 4500);
  assert.equal(out[0].visits, 4);
});

test("a booking in the future is not a visit that has happened", () => {
  const out = whoHasNotBeenBack(
    [
      ...regular("marie", "Marie", 42, 4, 120),
      { contactId: "marie", name: "Marie", at: new Date(NOW.getTime() + 5 * DAY).toISOString() },
    ],
    NOW,
  );
  assert.equal(out[0].daysSince, 120, "the future booking must not count as her last visit");
});
