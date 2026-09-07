import { test } from "node:test";
import assert from "node:assert/strict";
import { whatToForget, lastTouched, type Ageing } from "./retention.ts";

/*
 * Two years back from today, which is what a 24-month period works out as.
 * Anything last touched before this goes; anything after it stays.
 */
const CUTOFF = new Date("2024-09-07T00:00:00Z");

const conv = (over: Partial<Ageing> & { id: string }): Ageing => ({
  contact_id: "c1",
  created_at: "2020-01-01T00:00:00Z",
  last_message_at: null,
  ...over,
});

test("an old enquiry nobody acted on goes", () => {
  const going = whatToForget([conv({ id: "a" })], new Set(), CUTOFF);
  assert.deepEqual(going.map((c) => c.id), ["a"]);
});

test("a recent one stays", () => {
  const going = whatToForget(
    [conv({ id: "a", created_at: "2026-08-01T00:00:00Z" })],
    new Set(),
    CUTOFF,
  );
  assert.deepEqual(going, []);
});

test("one that became an appointment stays however old", () => {
  const going = whatToForget([conv({ id: "a" })], new Set(["a"]), CUTOFF);
  assert.deepEqual(going, []);
});

/*
 * The one this was rewritten for.
 *
 * A text conversation is keyed on the customer's number and reused for as long
 * as they keep texting, so a regular of three years is a single row created
 * three years ago carrying a message from last week. Judged on when it started,
 * a two-year period deleted their whole history including last week's — and
 * took the customer with it, if they book by walking in.
 */
test("a long-running thread is judged on its last message, not its first", () => {
  const regular = conv({
    id: "regular",
    created_at: "2023-01-01T00:00:00Z",
    last_message_at: "2026-09-01T00:00:00Z",
  });
  assert.deepEqual(whatToForget([regular], new Set(), CUTOFF), []);
});

test("a thread that started and stopped long ago still goes", () => {
  const dead = conv({
    id: "dead",
    created_at: "2023-01-01T00:00:00Z",
    last_message_at: "2023-02-01T00:00:00Z",
  });
  assert.deepEqual(whatToForget([dead], new Set(), CUTOFF).map((c) => c.id), ["dead"]);
});

test("with no last message it falls back to when it started", () => {
  assert.equal(lastTouched(conv({ id: "a" })), "2020-01-01T00:00:00Z");
  assert.equal(
    lastTouched(conv({ id: "a", last_message_at: "2026-01-01T00:00:00Z" })),
    "2026-01-01T00:00:00Z",
  );
});

test("the two rules apply together", () => {
  const going = whatToForget(
    [
      conv({ id: "old-unbooked" }),
      conv({ id: "old-booked" }),
      conv({ id: "old-but-live", last_message_at: "2026-09-06T00:00:00Z" }),
      conv({ id: "recent", created_at: "2026-09-06T00:00:00Z" }),
    ],
    new Set(["old-booked"]),
    CUTOFF,
  );
  assert.deepEqual(going.map((c) => c.id), ["old-unbooked"]);
});
