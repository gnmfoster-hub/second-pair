import { test } from "node:test";
import assert from "node:assert/strict";
import { safeNext } from "./safeNext.ts";

test("an ordinary path is kept", () => {
  assert.equal(safeNext("/diary"), "/diary");
  assert.equal(safeNext("/settings/artists?tab=1"), "/settings/artists?tab=1");
  assert.equal(safeNext("/"), "/");
});

test("nothing asked for is the home page", () => {
  assert.equal(safeNext(null), "/");
  assert.equal(safeNext(undefined), "/");
  assert.equal(safeNext(""), "/");
});

// ------------------------------------------------- the ways off this site

test("an absolute URL is refused", () => {
  assert.equal(safeNext("https://evil.example/steal"), "/");
  assert.equal(safeNext("http://evil.example"), "/");
});

test("a protocol-relative URL is refused", () => {
  assert.equal(safeNext("//evil.example"), "/");
});

test("the backslash version is refused too", () => {
  // Several browsers normalise "/\" to "//", which is the one a simple
  // "starts with a slash" check lets straight through.
  assert.equal(safeNext("/\\evil.example"), "/");
});

test("a scheme with no slashes is refused", () => {
  assert.equal(safeNext("javascript:alert(1)"), "/");
  assert.equal(safeNext("mailto:someone@example.com"), "/");
});

test("a bare path with no leading slash is refused", () => {
  assert.equal(safeNext("evil.example"), "/");
});
