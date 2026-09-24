import { test } from "node:test";
import assert from "node:assert/strict";
import { countsAsEnquiry } from "./conversationStatus.ts";

test("an ordinary conversation is an enquiry", () => {
  assert.equal(countsAsEnquiry("new"), true);
  assert.equal(countsAsEnquiry("booked"), true);
  assert.equal(countsAsEnquiry("needs_human"), true);
});

test("spam and the business's own post never counted", () => {
  assert.equal(countsAsEnquiry("spam"), false);
  assert.equal(countsAsEnquiry("paperwork"), false);
});

/*
 * Giles sent a test message to a client from their page and found it in his
 * inbox as though they had written in. They had not — he had. And every report
 * in the product asks this question, so a salon texting twenty regulars about
 * a cancellation gained twenty enquiries it never received.
 */
test("a message the business sent first is not an enquiry", () => {
  assert.equal(countsAsEnquiry("new", { outbound: true }), false);
});

/*
 * Somebody answering a text you sent them has still not enquired. The reply is
 * not lost — it is a conversation like any other — it simply is not demand.
 */
test("a reply does not turn it into one", () => {
  assert.equal(
    countsAsEnquiry("qualified", { outbound: true, last_inbound_at: "2026-09-24T10:00:00Z" }),
    false,
  );
});

/*
 * Every conversation that predates the flag has it null, and every one of
 * those was somebody writing in. Nothing already counted stops counting.
 */
test("a conversation from before the flag is unchanged", () => {
  assert.equal(countsAsEnquiry("new", {}), true);
  assert.equal(countsAsEnquiry("new", { outbound: null }), true);
  assert.equal(countsAsEnquiry("new", null), true);
  assert.equal(countsAsEnquiry("new", undefined), true);
});

test("the old single-argument call still means what it meant", () => {
  assert.equal(countsAsEnquiry("new"), true);
  assert.equal(countsAsEnquiry("spam"), false);
});

/* Spam is spam whoever started it. */
test("status still wins where it is decisive", () => {
  assert.equal(countsAsEnquiry("spam", { outbound: true }), false);
  assert.equal(countsAsEnquiry("paperwork", { outbound: false }), false);
});
