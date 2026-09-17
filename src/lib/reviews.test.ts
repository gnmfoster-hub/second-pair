import { test } from "node:test";
import assert from "node:assert/strict";
import { worthAsking, reviewMessage, yesterdayIn, type Finished } from "./reviews.ts";

const now = new Date("2026-09-18T07:00:00Z");

const booking = (over: Partial<Finished> = {}): Finished => ({
  id: "b1",
  ends_at: "2026-09-17T15:00:00Z",
  cancelled_at: null,
  contact_id: "c1",
  source: "assistant",
  ...over,
});

test("a finished appointment with somebody attached is asked about", () => {
  assert.equal(worthAsking([booking()], now).length, 1);
});

test("the ways it would be embarrassing to ask", () => {
  assert.deepEqual(worthAsking([booking({ cancelled_at: "2026-09-16T10:00:00Z" })], now), [],
    "a cancelled appointment never happened");
  assert.deepEqual(worthAsking([booking({ contact_id: null })], now), [],
    "nobody to send it to");
  assert.deepEqual(worthAsking([booking({ source: "block" })], now), [],
    "a lunch break is not an appointment");
  assert.deepEqual(worthAsking([booking({ ends_at: "2026-09-19T15:00:00Z" })], now), [],
    "it has not happened yet — a moved booking must not be asked about early");
});

/*
 * Somebody who had two things done is asked once. The second message reads as
 * nagging, and the first one already asked.
 */
test("one message per person, however many appointments", () => {
  const asked = worthAsking(
    [booking({ id: "b1" }), booking({ id: "b2", ends_at: "2026-09-17T17:00:00Z" })],
    now,
  );
  assert.equal(asked.length, 1);
  assert.equal(asked[0].id, "b1", "the first one they had");
});

test("two different people both get asked", () => {
  const asked = worthAsking([booking({ id: "b1" }), booking({ id: "b2", contact_id: "c2" })], now);
  assert.equal(asked.length, 2);
});

test("it reads like a favour being asked, not a demand for stars", () => {
  const text = reviewMessage({
    firstName: "Jo",
    business: "Living Canvas Tattoo",
    what: "Half sleeve",
    url: "https://g.page/r/abc/review",
  });

  assert.match(text, /^Hi Jo/);
  assert.match(text, /half sleeve/, "in their words, lowercased mid-sentence");
  assert.match(text, /Living Canvas Tattoo/);
  assert.ok(text.endsWith("https://g.page/r/abc/review"), "the link where a thumb lands");
  assert.doesNotMatch(text, /five star|5 star/i, "asking for a rating is against Google's rules");
  assert.ok(text.length < 200, "it is a favour, so it is short");
});

test("it works when we know nothing but the business", () => {
  const text = reviewMessage({ business: "Ashcroft Electrical", url: "https://example.com/r" });
  assert.match(text, /^Hi —/);
  assert.doesNotMatch(text, /undefined|null/);
});

test("yesterday is yesterday where the business is", () => {
  const { from, to } = yesterdayIn("Europe/London", new Date("2026-09-18T06:30:00Z"));
  assert.equal(from, "2026-09-17T00:00:00.000Z");
  assert.equal(to, "2026-09-18T00:00:00.000Z");
});
