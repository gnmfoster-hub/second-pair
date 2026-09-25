import { test } from "node:test";
import assert from "node:assert/strict";
import {
  voiceFor,
  greetingFor,
  tierOf,
  VOICES,
  DEFAULT_VOICE,
  GREETING_LIMIT,
} from "./howItSounds.ts";

/*
 * Twilio does not validate a voice name in advance. An unknown one is a call
 * that reaches somebody and says nothing at all, which is the worst failure
 * this product has.
 */
test("an unknown voice falls back rather than being passed through", () => {
  assert.equal(voiceFor("Polly.Nonsense"), DEFAULT_VOICE);
  assert.equal(voiceFor(""), DEFAULT_VOICE);
  assert.equal(voiceFor(null), DEFAULT_VOICE);
  assert.equal(voiceFor(undefined), DEFAULT_VOICE);
  assert.equal(voiceFor("alice"), DEFAULT_VOICE, "the old American default is not on the list");
});

test("a voice from the list is used", () => {
  assert.equal(voiceFor("Polly.Brian-Neural"), "Polly.Brian-Neural");
});

test("every voice on the list is British and named for a person", () => {
  for (const v of VOICES) {
    assert.match(v.what, /British/);
    assert.ok(v.label.length > 2, `${v.id} needs a name somebody would recognise`);
    assert.match(v.id, /^Polly\./);
  }
});

/*
 * Giles: "make it the default, re-cost it, and have the ability to switch
 * back." All three of those are facts about this list.
 */
test("the default is the generative voice", () => {
  assert.equal(DEFAULT_VOICE, "Polly.Amy-Generative");
  assert.equal(tierOf(DEFAULT_VOICE), "generative");
});

test("there is always a cheaper one to switch back to", () => {
  const cheaper = VOICES.filter((v) => v.tier === "neural");
  assert.ok(cheaper.length > 0, "switching back has to be possible");
  assert.ok(
    cheaper.some((v) => v.label.startsWith("Amy")),
    "the same voice on the cheaper engine, so going back is not also a change of person",
  );
});

test("the tier is what gets billed, so an unknown voice must not read as cheap", () => {
  assert.equal(tierOf("Polly.Brian-Neural"), "neural");
  assert.equal(tierOf("Polly.Nonsense"), "generative", "unknown falls back to the default, which is what will actually speak");
  assert.equal(tierOf(null), "generative");
});

/*
 * A call that connects to silence is one the caller rings off from, and they
 * do not ring back.
 */
test("there is always something to say", () => {
  assert.equal(greetingFor(null, "Neat & Tidy"), "Hello, Neat & Tidy. How can I help?");
  assert.equal(greetingFor("", null), "Hello. How can I help?");
  assert.equal(greetingFor("   ", "  "), "Hello. How can I help?");
});

test("a business's own words win", () => {
  assert.equal(greetingFor("Morning, Dave speaking.", "Dave's Plastering"), "Morning, Dave speaking.");
});

/*
 * Trimmed rather than refused. This runs with a stranger on the line, and the
 * settings screen is where somebody is told it is too long.
 */
test("a greeting somebody wrote an essay into is cut, not dropped", () => {
  const essay = "A".repeat(400);
  const said = greetingFor(essay, "Anybody");
  assert.equal(said.length, GREETING_LIMIT);
  assert.ok(said.startsWith("A"));
});

test("four seconds is about the limit", () => {
  assert.ok(GREETING_LIMIT <= 160, "longer than a text message is longer than anybody listens");
});
