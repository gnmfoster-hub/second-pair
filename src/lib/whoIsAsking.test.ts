import { test } from "node:test";
import assert from "node:assert/strict";
import { whoIsAsking, waitedFor, askingLine, type Asking } from "./whoIsAsking.ts";

const NOW = Date.parse("2026-09-25T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

const asking = (over: Partial<Asking> = {}): Asking => ({
  conversationId: "c1",
  who: "Marie",
  what: "Half head of foils",
  when: "Saturdays, or after 5 in the week",
  status: "new",
  at: hoursAgo(1),
  ...over,
});

test("only the ones still asking are listed", () => {
  const out = whoIsAsking(
    [
      asking({ conversationId: "live", status: "new" }),
      asking({ conversationId: "also", status: "qualified" }),
      asking({ conversationId: "booked", status: "booked" }),
      asking({ conversationId: "lost", status: "lost" }),
      asking({ conversationId: "spam", status: "spam" }),
      asking({ conversationId: "filed", status: "paperwork" }),
    ],
    NOW,
  ).map((w) => w.conversationId);

  assert.deepEqual(out.sort(), ["also", "live"]);
});

/*
 * Caught on the first look at the real panel: two of seven "asking" were
 * messages the business had sent, with no reply and nothing to say about time,
 * because nobody had asked for anything.
 */
test("a thread the business started is not somebody asking", () => {
  const out = whoIsAsking(
    [
      asking({ conversationId: "theirs" }),
      asking({ conversationId: "ours", weWroteFirst: true }),
    ],
    NOW,
  ).map((w) => w.conversationId);

  assert.deepEqual(out, ["theirs"]);
});

test("once they reply it is a conversation like any other", () => {
  const out = whoIsAsking([asking({ conversationId: "replied", weWroteFirst: false })], NOW);
  assert.equal(out.length, 1);
});

/*
 * Not newest first. A list ordered by arrival is a list where the one going
 * cold sinks, and somebody who wrote on Tuesday and heard nothing is the most
 * expensive thing on the screen.
 */
test("whoever is waiting on a person comes first", () => {
  const out = whoIsAsking(
    [
      asking({ conversationId: "fresh", status: "new", at: hoursAgo(1) }),
      asking({ conversationId: "needs", status: "needs_human", at: hoursAgo(1) }),
    ],
    NOW,
  ).map((w) => w.conversationId);

  assert.deepEqual(out, ["needs", "fresh"]);
});

test("after that, whoever has waited longest", () => {
  const out = whoIsAsking(
    [
      asking({ conversationId: "hour", at: hoursAgo(1) }),
      asking({ conversationId: "days", at: hoursAgo(50) }),
      asking({ conversationId: "yesterday", at: hoursAgo(20) }),
    ],
    NOW,
  ).map((w) => w.conversationId);

  assert.deepEqual(out, ["days", "yesterday", "hour"]);
});

test("waiting is counted in whole hours and never below nought", () => {
  const [one] = whoIsAsking([asking({ at: hoursAgo(5) })], NOW);
  assert.equal(one.hoursWaiting, 5);

  /* A clock skew must not produce "waiting -1 hours". */
  const [future] = whoIsAsking([asking({ at: new Date(NOW + 60_000).toISOString() })], NOW);
  assert.equal(future.hoursWaiting, 0);
});

test("the wait is said the way somebody would say it", () => {
  assert.equal(waitedFor(0), "just now");
  assert.equal(waitedFor(1), "an hour ago");
  assert.equal(waitedFor(6), "6 hours ago");
  assert.equal(waitedFor(26), "yesterday");
  assert.equal(waitedFor(72), "3 days ago");
});

/*
 * A panel saying "nobody is asking" on a screen somebody works in all day is
 * furniture, and the diary has enough of that.
 */
test("nobody asking says nothing at all", () => {
  assert.equal(askingLine([]), null);
});

test("the line leads with whoever is waiting on a person", () => {
  const waiting = whoIsAsking(
    [asking({ status: "needs_human" }), asking({ conversationId: "c2" })],
    NOW,
  );
  assert.equal(askingLine(waiting), "1 waiting on you, 2 asking in all");

  const calm = whoIsAsking([asking()], NOW);
  assert.equal(askingLine(calm), "1 asking about time");
});

/*
 * The customer's own words, kept. "Saturdays, or after 5 in the week" cannot
 * be drawn on a grid and should not be flattened into one — the shape of what
 * somebody will accept is the part that decides whether to ring them.
 */
test("what they said about time is carried through untouched", () => {
  const [one] = whoIsAsking([asking({ when: "Saturdays, or after 5 in the week" })], NOW);
  assert.equal(one.when, "Saturdays, or after 5 in the week");

  const [silent] = whoIsAsking([asking({ when: null })], NOW);
  assert.equal(silent.when, null);
});
