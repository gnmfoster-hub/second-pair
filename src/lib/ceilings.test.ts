import { test } from "node:test";
import assert from "node:assert/strict";
import { overCeiling, mayForward, describeCeiling } from "./ceilings.ts";

/*
 * No ceiling is the state of every business today, and running the migration
 * must not change what any of them does.
 */
test("no ceiling set means nothing ever stops", () => {
  assert.equal(overCeiling(9999, null), false);
  assert.equal(overCeiling(9999, undefined), false);
  assert.equal(mayForward(9999, null), true);
});

test("the ceiling is reached, not exceeded", () => {
  assert.equal(overCeiling(99, 100), false);
  assert.equal(overCeiling(100, 100), true);
  assert.equal(overCeiling(101, 100), true);
});

test("past the ceiling a call no longer rings a mobile", () => {
  assert.equal(mayForward(49, 50), true);
  assert.equal(mayForward(50, 50), false);
});

/*
 * A ceiling of nought is a real answer — never ring a mobile — and it must not
 * be read as "no ceiling". That is the bug the null check exists to avoid.
 */
test("a ceiling of nought means nought, not unlimited", () => {
  assert.equal(overCeiling(0, 0), true);
  assert.equal(mayForward(0, 0), false);
});

/*
 * The consequence is the half that stops a support call. A limit whose effect
 * is unstated is a limit somebody discovers.
 */
test("it says what happens when it is reached, not just the number", () => {
  const texts = describeCeiling("texts", 40, 100) ?? "";
  assert.match(texts, /40 of 100/);
  assert.match(texts, /email/);

  const calls = describeCeiling("calls", 10, 50) ?? "";
  assert.match(calls, /10 of 50/);
  assert.match(calls, /still answered/);
});

test("past it, it says so in the present tense", () => {
  assert.match(describeCeiling("texts", 100, 100) ?? "", /nothing else is being texted/);
  assert.match(describeCeiling("calls", 60, 50) ?? "", /no longer ringing a mobile/);
});

test("the last few are counted down", () => {
  assert.match(describeCeiling("calls", 47, 50) ?? "", /3 left/);
  assert.ok(!(describeCeiling("calls", 10, 50) ?? "").includes("left"));
});

test("no ceiling says nothing at all rather than saying unlimited", () => {
  assert.equal(describeCeiling("texts", 40, null), null);
  assert.equal(describeCeiling("calls", 40, undefined), null);
});
