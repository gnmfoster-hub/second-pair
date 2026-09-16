import { test } from "node:test";
import assert from "node:assert/strict";
import {
  whyTheyWereTreatedThatWay,
  countVerdicts,
  reasonOf,
  detailOf,
  keptOut,
  type Arrival,
} from "./whyEmail.ts";

/* The sentences the intake actually writes, taken from the code that writes them. */
const arrived: Arrival[] = [
  { verdict: "ignored", because: "it reads as a sales pitch (asks whether it has reached the owner; writes to the business as an online store)", at: "2026-09-16T10:40:00Z" },
  { verdict: "ignored", because: "it reads as a sales pitch (promises orders or sales in numbers; asks for a percentage commission)", at: "2026-09-16T11:43:00Z" },
  { verdict: "ignored", because: "it reads as a sales pitch (a throwaway seller's address; a greeting with nothing in it and no subject)", at: "2026-09-15T14:45:00Z" },
  { verdict: "ignored", because: "it is a mailing with an unsubscribe link in it", at: "2026-09-14T09:00:00Z" },
  { verdict: "ignored", because: "the mailbox it came through had already marked it as spam", at: "2026-09-14T14:10:00Z" },
  { verdict: "answered", because: null, at: "2026-09-13T08:42:00Z" },
  { verdict: "answered", because: null, at: "2026-09-12T08:42:00Z" },
  { verdict: "parked", because: "it looks like a code for setting this address up — read it and carry on", at: "2026-09-10T21:06:00Z" },
  { verdict: "refused", because: "no business has that address", at: "2026-09-09T12:00:00Z" },
];

test("the reason is the sentence, the brackets are the detail", () => {
  assert.equal(
    reasonOf("it reads as a sales pitch (asks whether it has reached the owner)"),
    "it reads as a sales pitch",
  );
  assert.equal(
    detailOf("it reads as a sales pitch (asks whether it has reached the owner)"),
    "asks whether it has reached the owner",
  );
  assert.equal(detailOf("it is a mailing with an unsubscribe link in it"), null);
  assert.equal(reasonOf(null), "no reason recorded");
  // An em dash in the middle is part of the sentence, not a bracket.
  assert.equal(
    reasonOf("it looks like a code for setting this address up — read it and carry on"),
    "it looks like a code for setting this address up — read it and carry on",
  );
});

test("three different pitches read as one line, not three", () => {
  const grouped = whyTheyWereTreatedThatWay(arrived);
  const pitch = grouped.find((g) => g.reason === "it reads as a sales pitch");
  assert.ok(pitch);
  assert.equal(pitch.count, 3);
  assert.equal(pitch.examples.length, 3, "and the detail is kept as examples");
  assert.match(pitch.examples[0], /asks whether it has reached the owner/);
});

test("commonest first, and the same reason under two verdicts stays apart", () => {
  const grouped = whyTheyWereTreatedThatWay(arrived);
  assert.equal(grouped[0].count, 3);
  assert.ok(grouped.every((g) => g.verdict), "every line says what was done");
  const verdicts = new Set(grouped.map((g) => g.verdict));
  assert.ok(verdicts.has("ignored") && verdicts.has("answered") && verdicts.has("parked"));
});

test("the counts add up to what arrived", () => {
  const counts = countVerdicts(arrived);
  assert.equal(counts.ignored, 5);
  assert.equal(counts.answered, 2);
  assert.equal(counts.parked, 1);
  assert.equal(counts.refused, 1);
  assert.equal(Object.values(counts).reduce((a, b) => a + b, 0), arrived.length);
});

test("how much never reached anybody", () => {
  assert.deepEqual(keptOut(arrived), { junk: 6, answered: 2, parked: 1 });
});

test("nothing at all is not an error", () => {
  assert.deepEqual(whyTheyWereTreatedThatWay([]), []);
  assert.deepEqual(keptOut([]), { junk: 0, answered: 0, parked: 0 });
});
