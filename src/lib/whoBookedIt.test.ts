import { test } from "node:test";
import assert from "node:assert/strict";
import { whoBookedIt, assistantWon, type Booked } from "./whoBookedIt.ts";

const job = (over: Partial<Booked> = {}): Booked => ({
  source: "manual",
  pence: 5000,
  countsAsWork: true,
  ...over,
});

test("it splits the money by who booked it", () => {
  const out = whoBookedIt([
    job({ source: "assistant", pence: 12000 }),
    job({ source: "manual", pence: 4000 }),
    job({ source: "manual", pence: 4000 }),
  ]);

  assert.deepEqual(out.assistant, { jobs: 1, pence: 12000 });
  assert.deepEqual(out.byHand, { jobs: 2, pence: 8000 });
  assert.equal(out.sharePercent, 60);
});

/*
 * A count flatters. Nine regulars typed in and one balayage the assistant won
 * is nine-to-one by count and about even by money, and the money is the one
 * that decides whether this is worth paying for.
 */
test("the share is of the money, not of the jobs", () => {
  const out = whoBookedIt([
    job({ source: "assistant", pence: 9000 }),
    ...Array.from({ length: 9 }, () => job({ source: "manual", pence: 1000 })),
  ]);
  assert.equal(out.assistant.jobs, 1);
  assert.equal(out.sharePercent, 50);
});

test("time off and somebody's own calendar are not work", () => {
  const out = whoBookedIt([
    job({ source: "block", pence: 0, countsAsWork: false }),
    job({ source: "personal", pence: 0, countsAsWork: false }),
    job({ source: "assistant", pence: 5000 }),
  ]);
  assert.equal(out.byHand.jobs, 0);
  assert.equal(out.assistant.jobs, 1);
});

/*
 * "0%" on an empty week is a judgement about the assistant. No figure is the
 * truth: there is nothing to divide.
 */
test("nothing worth anything gives no share at all", () => {
  assert.equal(whoBookedIt([]).sharePercent, null);
  assert.equal(whoBookedIt([job({ pence: 0 })]).sharePercent, null);
});

/*
 * The worth figure had this exact problem once, and the comment above it still
 * says so: a shop typing its own regulars in saw £0 every week and stopped
 * believing the number. A nought that appears every Monday is an accusation.
 */
test("it says nothing rather than nought when the assistant won nothing", () => {
  assert.equal(assistantWon(whoBookedIt([job({ source: "manual" })])), null);
  assert.deepEqual(assistantWon(whoBookedIt([job({ source: "assistant", pence: 7000 })])), {
    jobs: 1,
    pence: 7000,
  });
});

/* Anything that is not the assistant was put there by a person. */
test("an unknown source counts as somebody typing it in", () => {
  const out = whoBookedIt([job({ source: "imported" }), job({ source: "" })]);
  assert.equal(out.byHand.jobs, 2);
  assert.equal(out.assistant.jobs, 0);
});
