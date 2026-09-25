import { test } from "node:test";
import assert from "node:assert/strict";
import { howItWent, describeHowItWent } from "./howItWent.ts";

test("nothing answered yet says so rather than dividing by nought", () => {
  assert.equal(howItWent([]), null);
  assert.equal(howItWent([{ turns: 0, thinkingMs: 0, seconds: 0, spokenCharacters: 0 }]), null);
  assert.match(describeHowItWent(null), /nothing to measure/);
});

test("the wait is per turn, because a long call is not a slow one", () => {
  /* One call, 6 turns, 12 seconds of conversation: 2 seconds a turn. */
  const went = howItWent([{ turns: 6, thinkingMs: 9000, seconds: 12, spokenCharacters: 900 }]);
  assert.ok(went);
  assert.equal(went.perTurn, 2);
  assert.equal(went.oursPerTurn, 1.5);
  assert.equal(went.theirsPerTurn, 0.5);
  assert.equal(went.turns, 6);
  assert.equal(went.calls, 1);
});

test("several calls are averaged across every turn, not across calls", () => {
  const went = howItWent([
    { turns: 2, thinkingMs: 2000, seconds: 4, spokenCharacters: 200 },
    { turns: 8, thinkingMs: 8000, seconds: 16, spokenCharacters: 800 },
  ]);
  assert.ok(went);
  assert.equal(went.turns, 10);
  assert.equal(went.perTurn, 2, "20 seconds over 10 turns, not the mean of two calls");
});

test("a call that never got a turn is left out of the arithmetic", () => {
  const went = howItWent([
    { turns: 0, thinkingMs: 0, seconds: 0, spokenCharacters: 0 },
    { turns: 4, thinkingMs: 4000, seconds: 8, spokenCharacters: 400 },
  ]);
  assert.ok(went);
  assert.equal(went.calls, 1, "a call with no turns is not a fast call");
  assert.equal(went.perTurn, 2);
});

/*
 * The two clocks start in different places, and a call that ends between them
 * can leave the arithmetic slightly the wrong way round. That is a rounding
 * artefact and must never print as negative time spent on Twilio.
 */
test("the telephone's share is never negative", () => {
  const went = howItWent([{ turns: 2, thinkingMs: 9000, seconds: 3, spokenCharacters: 100 }]);
  assert.ok(went);
  assert.ok(went.theirsPerTurn >= 0);
  assert.ok(went.ourShare <= 100);
});

test("the sentence names whose job it is", () => {
  /* Mostly us. */
  const ours = howItWent([{ turns: 4, thinkingMs: 7000, seconds: 8, spokenCharacters: 400 }]);
  assert.match(describeHowItWent(ours), /our assistant thinking/);

  /* Mostly Twilio. */
  const theirs = howItWent([{ turns: 4, thinkingMs: 1000, seconds: 12, spokenCharacters: 400 }]);
  assert.match(describeHowItWent(theirs), /no work at our end would shorten/);

  /* Neither obviously. */
  const both = howItWent([{ turns: 4, thinkingMs: 4000, seconds: 8, spokenCharacters: 400 }]);
  assert.match(describeHowItWent(both), /Neither half/);
});

test("the sentence counts calls in English", () => {
  const one = howItWent([{ turns: 2, thinkingMs: 2000, seconds: 4, spokenCharacters: 100 }]);
  assert.match(describeHowItWent(one), /Over 1 call,/);

  const two = howItWent([
    { turns: 2, thinkingMs: 2000, seconds: 4, spokenCharacters: 100 },
    { turns: 2, thinkingMs: 2000, seconds: 4, spokenCharacters: 100 },
  ]);
  assert.match(describeHowItWent(two), /Over 2 calls,/);
});
