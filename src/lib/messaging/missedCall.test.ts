import { test } from "node:test";
import assert from "node:assert/strict";
import { wasMissed, missedCallText, CALLBACK_WORD } from "./missedCall.ts";

test("a call somebody answered is not missed", () => {
  assert.equal(wasMissed("completed"), false);
  assert.equal(wasMissed("answered"), false);
  assert.equal(wasMissed("COMPLETED"), false);
});

test("every way a call fails to reach them counts as missed", () => {
  for (const status of ["no-answer", "busy", "failed", "canceled"]) {
    assert.equal(wasMissed(status), true, status);
  }
});

/*
 * Erring towards texting. A text after a call that was answered is a mild
 * redundancy; silence after one that was not is the whole failure.
 */
test("a status we do not recognise is treated as missed", () => {
  assert.equal(wasMissed("something-new"), true);
  assert.equal(wasMissed(null), true);
  assert.equal(wasMissed(undefined), true);
  assert.equal(wasMissed(""), true);
});

test("the text says who it is and asks something", () => {
  const t = missedCallText("Living Canvas Tattoo");
  assert.match(t, /Living Canvas Tattoo/);
  assert.match(t, /missed your call/i);
  assert.match(t, /CALL/);
});

test("a number belonging to one person says so, and says it is their assistant", () => {
  assert.equal(
    missedCallText("The Fold Hair", "Sarah"),
    "Sorry we missed your call. This is Sarah's assistant at The Fold Hair. " +
      "Tell me what you need and I can help here, or say CALL and we'll ring you back. " +
      "Reply STOP and we won't text again.",
  );
});

test("a blank name is the business's assistant, not a dangling 'at'", () => {
  assert.match(
    missedCallText("Muddy Paws", "  "),
    /^Sorry we missed your call. This is the assistant at Muddy Paws\./,
  );
  assert.match(missedCallText("Muddy Paws", null), /This is the assistant at Muddy Paws\./);
});

/*
 * The one message in the product that reaches somebody who never wrote to us.
 * It must say what it is, and it must say how to stop it.
 */
test("it never pretends to be a person, and always offers a way out", () => {
  for (const [business, person] of [["Muddy Paws", null], ["The Fold Hair", "Sarah"]] as const) {
    const text = missedCallText(business, person);
    assert.match(text, /assistant/i, `${business} does not say it is an assistant`);
    assert.match(text, /Reply STOP/, `${business} offers no way to stop`);
  }
});

/*
 * The promise and the handling used to be two separate facts. The word
 * appeared exactly once in the product — in the sentence offering it — and
 * nothing handled it, so whether a bare "CALL" produced a callback came down
 * to the model reading one word as a request for a human.
 */
test("the text offers the same word the assistant is told to honour", () => {
  assert.match(missedCallText("Neat & Tidy"), new RegExp(CALLBACK_WORD));
});

test("it says who it is, so a stranger is not reading an unsigned text", () => {
  assert.match(missedCallText("Neat & Tidy"), /Neat & Tidy/);
});

test("a named person is who it comes from, because they are who was rung", () => {
  const text = missedCallText("Neat & Tidy", "Karen");
  // Karen's, and said to be Karen's assistant rather than Karen.
  assert.match(text, /Karen's assistant at Neat & Tidy/);
});

/* A blank name must not produce "  at Neat & Tidy". */
test("an empty name falls back to the business rather than leaving a gap", () => {
  assert.equal(missedCallText("Neat & Tidy", "   "), missedCallText("Neat & Tidy"));
});

/*
 * It has to ask something. A text that only apologises invites no answer, and
 * the point is to start a conversation rather than be polite about missing one.
 */
test("it asks for something rather than only apologising", () => {
  assert.match(missedCallText("Neat & Tidy"), /Tell me what you need/);
});

/*
 * The text goes out as the call is handed to the answerphone, so it lands
 * while the caller is still talking. Telling somebody to type out what they
 * need in the same second they are saying it out loud reads as though nobody
 * is listening.
 */
test("it does not ask them to type what they are busy saying", () => {
  const speaking = missedCallText("Cogs & Co Garage", null, true);
  assert.match(speaking, /Leave your message and I'll text you straight back/);
  assert.doesNotMatch(speaking, /Tell me what you need/);

  // And it still works for somebody who rings off at the beep.
  assert.match(speaking, /tell me here instead/);
  assert.match(speaking, new RegExp(CALLBACK_WORD));
  assert.match(speaking, /Reply STOP/);

  // Unchanged where there is no answerphone.
  assert.match(missedCallText("Cogs & Co Garage"), /Tell me what you need and I can help here/);
});
