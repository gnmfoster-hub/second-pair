import { test } from "node:test";
import assert from "node:assert/strict";
import { whatTheyHear, readTranscript, asMessage, voicemailKey } from "./voicemail.ts";

/*
 * The notice has to be before the beep, and it has to be in the words a person
 * uses. A recording notice nobody hears is not a notice.
 */
test("the caller is told they are being recorded, before the tone", () => {
  const said = whatTheyHear("Cogs & Co Garage", null);
  assert.match(said, /Cogs & Co Garage/);
  assert.match(said, /written down/);
  assert.match(said, /text you straight back/);

  // And whose phone it is, where the number belongs to one person.
  assert.match(whatTheyHear("Willow & Co", "Sarah"), /Sarah at Willow & Co/);
});

test("a business with no name still gets a sentence", () => {
  assert.match(whatTheyHear(null, null), /^Thanks for calling us\./);
});

test("only a finished transcription is a message", () => {
  assert.equal(readTranscript("completed", "Hi it's Dave, my boiler is leaking"), "Hi it's Dave, my boiler is leaking");
  assert.equal(readTranscript("failed", "Hi it's Dave, my boiler is leaking"), null);
  assert.equal(readTranscript("completed", "   "), null);
  assert.equal(readTranscript(null, "something"), null);
});

/*
 * Transcribers do not return silence, they return their best guess at it. A
 * text answering "Thank you" as though it were an enquiry reads like a wrong
 * number, and the plain "sorry we missed you" has already gone anyway.
 */
test("a cough is not an enquiry", () => {
  assert.equal(readTranscript("completed", "Thank you"), null);
  assert.equal(readTranscript("completed", "Okay"), null);
  assert.equal(readTranscript("completed", "hello is that you"), "hello is that you");
});

test("a very long message is cut rather than refused", () => {
  const long = "word ".repeat(600).trim();
  const read = readTranscript("completed", long);
  assert.equal(read?.length, 1500);
});

test("the assistant is told it is reading a transcript", () => {
  assert.match(asMessage("my boiler is leaking"), /^\[Voicemail, transcribed/);
  assert.match(asMessage("my boiler is leaking"), /my boiler is leaking$/);
});

test("one voicemail is answered once", () => {
  assert.equal(voicemailKey("RE123"), "voicemail:RE123");
  assert.notEqual(voicemailKey("RE123"), voicemailKey("RE124"));
});
