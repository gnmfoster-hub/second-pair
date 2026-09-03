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

// ------------------------------------- a destination that carries its own next

test("a path may carry a query string", () => {
  /*
   * Relied on by the link that sets a new business up: it sends somebody to
   * choose a password and tells that page where to go afterwards. If the query
   * were stripped they would set a password and land on the inbox with their
   * business half configured.
   */
  assert.equal(safeNext("/reset-password?next=/onboarding"), "/reset-password?next=/onboarding");
});

test("an off-site value hidden in a query is still only a path here", () => {
  // The query is carried, not followed. Whatever reads it must sanitise it
  // again — which is why reset-password passes it back through this.
  assert.equal(safeNext("//evil.com?next=/onboarding"), "/");
  // Built from a char code: a backslash in a heredoc does not survive to
  // the file, and a test that quietly checks "/evil.com" proves nothing.
  const backslash = String.fromCharCode(92);
  assert.equal(safeNext(`/${backslash}evil.com`), "/");
  assert.equal(safeNext("https://evil.com/?next=/onboarding"), "/");
});

test("the chained value is itself checked", () => {
  // What reset-password pulls out of its own address bar and hands to router.
  assert.equal(safeNext("/onboarding"), "/onboarding");
  assert.equal(safeNext("https://evil.com/onboarding"), "/");
});
