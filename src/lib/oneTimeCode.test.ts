import { test } from "node:test";
import assert from "node:assert/strict";
import { oneTimeCodeIn } from "./oneTimeCode.ts";

// ------------------------------------------------------------ the real one

test("the message that actually arrived on 11 October", () => {
  /*
   * Verbatim, misspelling and all. It landed in Second Pair's own inbox while
   * Giles was resubmitting to Meta, and the assistant answered it.
   */
  const found = oneTimeCodeIn(
    "<#>736049 is your confirmation c0de. For your security, do not share this c0de.",
  );
  assert.equal(found?.code, "736049");
});

// ------------------------------------------------------------ codes

test("the usual shapes are caught", () => {
  for (const [body, code] of [
    ["Your verification code is 482915", "482915"],
    ["G-739201 is your Google verification code", "739201"],
    ["5591 is your one-time passcode. Never share it with anyone.", "5591"],
    ["Your OTP is 90210", "90210"],
    ["Use 123456 as your login code. Do not share.", "123456"],
    ["Your security code: 44120", "44120"],
  ]) {
    assert.equal(oneTimeCodeIn(body)?.code, code, body);
  }
});

// -------------------------------------------- the ones that must NOT match

test("a customer talking about a code is still a customer", () => {
  /*
   * The whole risk of this feature. Treating a person as paperwork means their
   * message is never answered, which is far worse than an unanswered robot.
   */
  for (const body of [
    "Hi, what's the code for the gate? My postcode is TQ12 1GZ",
    "Did you get my code 4821?",
    "The code on the back of my card is 8842, is that what you need?",
    "My gate code is 4521, come straight round",
    "Can I book for the 2026 plate car, reg AB12 CDE",
    "Hi, any chance of a cut and blow-dry Friday morning?",
    "I paid £1200 on invoice 48821 last Tuesday",
    "Ring me on 07861911077 when you can",
  ]) {
    assert.equal(oneTimeCodeIn(body), null, body);
  }
});

test("a question is always a person, however it is worded", () => {
  // Carries every other signal and is plainly somebody talking.
  assert.equal(oneTimeCodeIn("Is 448210 your verification code? I got it by mistake"), null);
});

test("a long message is a person even with a code in it", () => {
  const body =
    "Hello, I had a text saying 448210 is your verification code but I never asked for one. " +
    "I am a bit worried somebody is trying to get into my account, and I wanted to check with you " +
    "before I do anything about it because my daughter also uses this number sometimes and she may " +
    "have been booking something without telling me, which would explain it entirely.";
  assert.equal(oneTimeCodeIn(body), null);
});

test("numbers without the words are left alone", () => {
  assert.equal(oneTimeCodeIn("482915"), null);
  assert.equal(oneTimeCodeIn("See you at 1430 on the 2nd"), null);
});

test("words without a number are left alone", () => {
  assert.equal(oneTimeCodeIn("Your verification code is on its way"), null);
});

test("a phone number is not a code", () => {
  // Eleven digits, so the 4-to-8 rule refuses it rather than taking a slice.
  assert.equal(oneTimeCodeIn("Your security code 07861911077"), null);
});

test("nothing at all is nothing", () => {
  assert.equal(oneTimeCodeIn(""), null);
  assert.equal(oneTimeCodeIn(null), null);
  assert.equal(oneTimeCodeIn(undefined), null);
});
