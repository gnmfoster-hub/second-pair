import { test } from "node:test";
import assert from "node:assert/strict";
import { howToSendPhotos } from "./photos.ts";

/*
 * Reported from a live conversation: a tattoo studio's customer, texting,
 * was told to use the paperclip. There is no paperclip in a messages app.
 */
test("nobody off the website is sent looking for a paperclip", () => {
  for (const channel of ["sms", "whatsapp", "instagram", "messenger", "email", "voice"]) {
    const line = howToSendPhotos(channel);

    /*
     * Checked as "is not told to use one", not as "does not contain the word"
     * — the wording for these channels names the paperclip in order to forbid
     * it, and a test that cannot tell an instruction from a prohibition would
     * fail on the fix and pass on the bug.
     */
    assert.doesNotMatch(line, /there is a paperclip/i, `${channel} was pointed at a paperclip`);
    assert.match(line, /never mention a paperclip/i, `${channel} was not warned off it`);
  }
});

test("but on the widget, where there is one, it points at it", () => {
  assert.match(howToSendPhotos("web"), /paperclip/i);
});

test("a photo is still asked for, whatever the channel", () => {
  for (const channel of ["web", "sms", "whatsapp", "instagram"]) {
    assert.match(howToSendPhotos(channel), /photo|image/i);
  }
});

/*
 * An unknown channel is anything that is not our own web widget, so it takes
 * the safe wording rather than the one that describes a screen.
 */
test("something we have never heard of is not assumed to be the widget", () => {
  assert.doesNotMatch(howToSendPhotos("carrier pigeon"), /there is a paperclip/i);
  assert.doesNotMatch(howToSendPhotos(""), /there is a paperclip/i);
});
