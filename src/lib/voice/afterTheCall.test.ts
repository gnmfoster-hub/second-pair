import { test } from "node:test";
import assert from "node:assert/strict";
import { afterCallText } from "./afterTheCall.ts";

const base = {
  day: "Tuesday 9 October",
  time: "2:30pm",
  person: "Karen",
  business: "Neat & Tidy Solutions",
  url: "https://www.second-pair.com/b/abc123",
  held: false,
};

test("a confirmed booking says booked", () => {
  const text = afterCallText(base);
  assert.match(text, /You are booked in with Karen on Tuesday 9 October at 2:30pm\./);
  assert.doesNotMatch(text, /pencilled/);
});

test("a held booking says pencilled in, not booked", () => {
  const text = afterCallText({ ...base, held: true });
  assert.match(text, /pencilled you in/);
  assert.match(text, /confirm it shortly/);
  assert.doesNotMatch(
    text,
    /You are booked/,
    "a held slot promised as booked is somebody turning up to a shut door",
  );
});

test("the link is last, on its own line", () => {
  const text = afterCallText(base);
  const lines = text.split("\n").filter(Boolean);
  assert.equal(lines.length, 2);
  assert.match(lines[1], /^Change or cancel it here: https:/);
});

test("no link means no dangling offer", () => {
  const text = afterCallText({ ...base, url: "" });
  assert.doesNotMatch(text, /Change or cancel/);
  assert.doesNotMatch(text, /here:\s*$/);
  assert.match(text, /You are booked in with Karen/);
});

test("it names the business, because it arrives out of nowhere", () => {
  assert.match(afterCallText(base), /Neat & Tidy Solutions/);
  assert.match(afterCallText({ ...base, held: true }), /Neat & Tidy Solutions/);
});

test("it is short enough not to be split into several texts", () => {
  /* One SMS segment is 160 characters; two is the most anybody should pay for
     to say three facts. */
  assert.ok(
    afterCallText(base).length <= 320,
    `the text was ${afterCallText(base).length} characters`,
  );
});
