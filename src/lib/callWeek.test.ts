import { test } from "node:test";
import assert from "node:assert/strict";
import { callWeek, callLine, type CallRow } from "./callWeek.ts";

const call = (over: Partial<CallRow> = {}): CallRow => ({
  forwarded: true,
  answered: false,
  rangSeconds: 20,
  ...over,
});

test("it counts what happened to each call", () => {
  const out = callWeek([call({ answered: true }), call(), call({ forwarded: false })]);
  assert.equal(out.calls, 3);
  assert.equal(out.answered, 1);
  assert.equal(out.textedBack, 2);
  assert.equal(out.straightToText, 1);
});

/*
 * "Answered" and "forwarded" are different questions, and the difference
 * decides whether a business thinks the thing is working.
 */
test("a call that rang nowhere is not a call that rang out", () => {
  const out = callWeek([call({ forwarded: false, rangSeconds: 0 })]);
  assert.equal(out.straightToText, 1);
  assert.match(callLine(out) ?? "", /texted back straight away/);
});

test("a call that rang and was missed says it rang out", () => {
  const out = callWeek([call({ forwarded: true, answered: false })]);
  assert.equal(out.straightToText, 0);
  assert.match(callLine(out) ?? "", /rang out/);
});

test("a mixture says both", () => {
  const out = callWeek([call(), call({ forwarded: false })]);
  const line = callLine(out) ?? "";
  assert.match(line, /1 rang out/);
  assert.match(line, /1 texted straight away/);
});

test("all answered is worth saying plainly", () => {
  assert.equal(callLine(callWeek([call({ answered: true })])), "Every one answered in person.");
});

/*
 * No calls is no line. A business that has never been rung should not be told
 * every week that nobody rang.
 */
test("no calls says nothing", () => {
  assert.equal(callLine(callWeek([])), null);
});
