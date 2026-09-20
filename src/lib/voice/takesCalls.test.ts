import { test } from "node:test";
import assert from "node:assert/strict";
import { takesCalls } from "./takesCalls.ts";

/*
 * The fault this was written for.
 *
 * Neat & Tidy had the telephone switched off in the back office and the "let
 * them leave a message" tick box was still sitting in their settings. It could
 * be ticked and it saved, and it did nothing at all, because a call to their
 * number is answered by saying the number takes texts only, long before
 * anything reads that setting.
 *
 * Two ways for that to hurt: a business believing it has an answerphone it has
 * not got, and a business switching on something it is not paying for.
 */
test("a business with only texts does not take calls", () => {
  assert.equal(takesCalls(["sms"]), false);
  assert.equal(takesCalls(["web", "sms", "email"]), false);
});

test("a business with the telephone does", () => {
  assert.equal(takesCalls(["sms", "voice"]), true);
  assert.equal(takesCalls(["voice"]), true);
});

/*
 * Nothing set is what every business started with, and it is not permission.
 * The dangerous default here is the generous one: it would ring a mobile, at
 * the dearest rate there is, for somebody who had bought none of it.
 */
test("nothing set is no", () => {
  assert.equal(takesCalls(null), false);
  assert.equal(takesCalls(undefined), false);
  assert.equal(takesCalls([]), false);
});
