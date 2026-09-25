import { test } from "node:test";
import assert from "node:assert/strict";
import { howItWent, describeHowItWent, CHARACTERS_A_SECOND } from "./howItWent.ts";

test("nothing answered yet says so rather than dividing by nought", () => {
  assert.equal(howItWent([]), null);
  assert.equal(howItWent([{ turns: 0, thinkingMs: 0, seconds: 0, spokenCharacters: 0 }]), null);
  assert.match(describeHowItWent(null), /nothing to measure/);
});

/*
 * ── The call that caused all of this ────────────────────────────────────────
 *
 * Giles's second test call, exactly as the database recorded it: four turns,
 * fifty-five seconds, 21,454ms thinking, 706 characters spoken.
 *
 * The first version of this tool split the wait two ways — ours and Twilio's —
 * and put the time the assistant spent SPEAKING into Twilio's half, where it
 * read as nothing we could do about it. It was twelve of the fourteen seconds,
 * and it was entirely ours: the reply was three times too long for a phone.
 *
 * A tool that points at the wrong half is worse than no tool, because somebody
 * acts on it. This is the case that must never regress.
 */
test("the real call blames the reply length, which is what was actually wrong", () => {
  const went = howItWent([
    { turns: 4, thinkingMs: 21454, seconds: 55, spokenCharacters: 706 },
  ]);
  assert.ok(went);

  assert.equal(went.perTurn, 13.8);
  assert.equal(went.thinkingPerTurn, 5.4);
  /* 706 characters at fifteen a second, over four turns. */
  assert.equal(went.talkingPerTurn, 11.8);
  assert.equal(went.biggest, "talking");

  const said = describeHowItWent(went);
  assert.match(said, /the answer itself being long/);
  assert.match(said, /it is ours/);
  assert.doesNotMatch(
    said,
    /no work at our end would shorten/,
    "the old tool would have said this, and it would have been wrong",
  );
});

test("the wait is per turn, because a long call is not a slow one", () => {
  const went = howItWent([{ turns: 6, thinkingMs: 9000, seconds: 12, spokenCharacters: 90 }]);
  assert.ok(went);
  assert.equal(went.perTurn, 2);
  assert.equal(went.thinkingPerTurn, 1.5);
  assert.equal(went.turns, 6);
  assert.equal(went.calls, 1);
});

test("several calls are averaged across every turn, not across calls", () => {
  const went = howItWent([
    { turns: 2, thinkingMs: 2000, seconds: 4, spokenCharacters: 30 },
    { turns: 8, thinkingMs: 8000, seconds: 16, spokenCharacters: 120 },
  ]);
  assert.ok(went);
  assert.equal(went.turns, 10);
  assert.equal(went.perTurn, 2, "20 seconds over 10 turns, not the mean of two calls");
});

test("a call that never got a turn is left out of the arithmetic", () => {
  const went = howItWent([
    { turns: 0, thinkingMs: 0, seconds: 0, spokenCharacters: 0 },
    { turns: 4, thinkingMs: 4000, seconds: 8, spokenCharacters: 60 },
  ]);
  assert.ok(went);
  assert.equal(went.calls, 1, "a call with no turns is not a fast call");
  assert.equal(went.perTurn, 2);
});

/*
 * The clocks start in different places, and a call that ends between them can
 * leave the arithmetic slightly the wrong way round. That is a rounding
 * artefact and must never print as negative time spent on Twilio.
 */
test("the telephone's share is never negative", () => {
  const went = howItWent([{ turns: 2, thinkingMs: 9000, seconds: 3, spokenCharacters: 900 }]);
  assert.ok(went);
  assert.ok(went.theirsPerTurn >= 0);
});

test("talking is worked out from what was actually said", () => {
  const went = howItWent([
    { turns: 1, thinkingMs: 0, seconds: 10, spokenCharacters: CHARACTERS_A_SECOND * 3 },
  ]);
  assert.ok(went);
  assert.equal(went.talkingPerTurn, 3);
});

test("each ending names a job somebody can do", () => {
  /* Thinking dominates: short reply, slow model. */
  const thinking = howItWent([{ turns: 4, thinkingMs: 20000, seconds: 24, spokenCharacters: 60 }]);
  assert.equal(thinking?.biggest, "thinking");
  assert.match(describeHowItWent(thinking), /deciding what to say, which is ours/);

  /* Twilio dominates: short reply, fast model, long gaps. */
  const theirs = howItWent([{ turns: 4, thinkingMs: 1000, seconds: 40, spokenCharacters: 60 }]);
  assert.equal(theirs?.biggest, "theirs");
  assert.match(describeHowItWent(theirs), /no work at our end would shorten/);
});

test("the sentence counts calls in English and shows all three parts", () => {
  const one = howItWent([{ turns: 2, thinkingMs: 2000, seconds: 4, spokenCharacters: 30 }]);
  const said = describeHowItWent(one);
  assert.match(said, /Over 1 call,/);
  assert.match(said, /thinking/);
  assert.match(said, /talking/);
  assert.match(said, /the telephone/);

  const two = howItWent([
    { turns: 2, thinkingMs: 2000, seconds: 4, spokenCharacters: 30 },
    { turns: 2, thinkingMs: 2000, seconds: 4, spokenCharacters: 30 },
  ]);
  assert.match(describeHowItWent(two), /Over 2 calls,/);
});
