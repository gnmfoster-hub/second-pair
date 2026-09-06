import { test } from "node:test";
import assert from "node:assert/strict";
import { joinReply } from "./reply.ts";

test("one thing said once", () => {
  assert.equal(joinReply(["That's booked."]), "That's booked.");
});

test("a word before looking something up is kept, not thrown away", () => {
  assert.equal(
    joinReply(["Let me have a look.", "Priya's got Thursday at 9."]),
    "Let me have a look.\n\nPriya's got Thursday at 9.",
  );
});

/*
 * The failure this exists for. The assistant confirmed a move, made it, then
 * signed off — and the confirmation was the part that got dropped.
 */
test("the substance survives a sign-off that follows it", () => {
  assert.equal(
    joinReply(["Moved to Thursday 10 September at 9:30.", "Anything else, just shout."]),
    "Moved to Thursday 10 September at 9:30.\n\nAnything else, just shout.",
  );
});

test("saying the same thing twice is said once", () => {
  assert.equal(joinReply(["That's booked.", "That's booked."]), "That's booked.");
});

test("a fuller second version replaces the shorter first", () => {
  assert.equal(
    joinReply(["Priya's got Thursday.", "Priya's got Thursday at 9 or 9:30."]),
    "Priya's got Thursday at 9 or 9:30.",
  );
});

test("blanks and whitespace are not turns", () => {
  assert.equal(joinReply(["", "  ", "Booked."]), "Booked.");
  assert.equal(joinReply([]), "");
});
