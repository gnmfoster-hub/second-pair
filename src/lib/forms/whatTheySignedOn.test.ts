import { test } from "node:test";
import assert from "node:assert/strict";
import { whatTheySignedOn, signedRecord } from "./whatTheySignedOn.ts";

/* Real strings, abbreviated only where the tail carries nothing. */
const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1";
const IPAD =
  "Mozilla/5.0 (iPad; CPU OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1";
const IPAD_DESKTOP =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15 Touch";
const ANDROID_PHONE =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36";
const ANDROID_TABLET =
  "Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36";
const WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36";
const MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36";

test("the phone somebody actually signs on", () => {
  assert.equal(whatTheySignedOn(IPHONE), "an iPhone");
  assert.equal(whatTheySignedOn(ANDROID_PHONE), "an Android phone");
});

test("a tablet is not a phone and not a computer", () => {
  assert.equal(whatTheySignedOn(IPAD), "an iPad");
  assert.equal(whatTheySignedOn(ANDROID_TABLET), "an Android tablet");
});

test("an iPad in desktop mode is still an iPad", () => {
  assert.equal(
    whatTheySignedOn(IPAD_DESKTOP),
    "an iPad",
    "it calls itself a Macintosh; filing it as a Mac is the classic mistake",
  );
});

test("computers", () => {
  assert.equal(whatTheySignedOn(WINDOWS), "a Windows computer");
  assert.equal(whatTheySignedOn(MAC), "a Mac");
  assert.equal(whatTheySignedOn("Mozilla/5.0 (X11; CrOS x86_64 14541.0.0)"), "a Chromebook");
});

test("nothing useful says nothing", () => {
  assert.equal(whatTheySignedOn(null), "");
  assert.equal(whatTheySignedOn(undefined), "");
  assert.equal(whatTheySignedOn(""), "");
  assert.equal(
    whatTheySignedOn("curl/8.4.0"),
    "",
    "a record that guesses is worse than one that is quiet",
  );
});

test("the sentence reads whichever halves are known", () => {
  assert.equal(
    signedRecord({ when: "3 October 2026", ip: "81.2.3.4", agent: IPHONE }),
    "Submitted 3 October 2026 on an iPhone from 81.2.3.4.",
  );
  assert.equal(
    signedRecord({ when: "3 October 2026", ip: null, agent: IPHONE }),
    "Submitted 3 October 2026 on an iPhone.",
  );
  assert.equal(
    signedRecord({ when: "3 October 2026", ip: "81.2.3.4", agent: null }),
    "Submitted 3 October 2026 from 81.2.3.4.",
    "no device must not leave a dangling 'on'",
  );
  assert.equal(
    signedRecord({ when: "3 October 2026", ip: null, agent: null }),
    "Submitted 3 October 2026.",
  );
});
