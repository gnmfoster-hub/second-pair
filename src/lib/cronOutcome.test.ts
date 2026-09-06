import { test } from "node:test";
import assert from "node:assert/strict";
import { sweepWentWrong } from "./cronOutcome.ts";

const clean = { failures: [], forgetting: [], unanswered: 0, waiting: 0 };

test("a quiet sweep is not a failure", () => {
  assert.equal(sweepWentWrong(clean), false);
});

test("a reminder that could not be sent is", () => {
  assert.equal(sweepWentWrong({ ...clean, failures: ["Living Canvas: 2 failed"] }), true);
});

test("so is a business whose forgetting did not happen", () => {
  assert.equal(sweepWentWrong({ ...clean, forgetting: ["living-canvas: timeout"] }), true);
});

/*
 * The one that has to stay quiet. A business with no channel connected yet has
 * reminders waiting rather than lost, and it is in that state for days while
 * somebody gets round to Twilio. Red every five minutes for a fortnight is how
 * a red job stops meaning anything.
 */
test("reminders with nowhere to go are not a failure", () => {
  assert.equal(sweepWentWrong({ ...clean, waiting: 12 }), false);
});

test("waiting alongside a real failure is still a failure", () => {
  assert.equal(
    sweepWentWrong({ failures: ["x"], forgetting: [], unanswered: 0, waiting: 5 }),
    true,
  );
});

/*
 * The one found by calling the sweep on the live site and reading what came
 * back: this count was in the response all along, next to the others, and left
 * out of the decision. A customer wrote in, nobody answered, the assistant
 * stepped in on their behalf and that failed too. They have heard nothing.
 */
test("an enquiry nobody managed to answer is a failure", () => {
  assert.equal(sweepWentWrong({ ...clean, unanswered: 1 }), true);
});
