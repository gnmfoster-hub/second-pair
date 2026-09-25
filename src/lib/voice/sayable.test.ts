import { test } from "node:test";
import assert from "node:assert/strict";
import { sayable } from "./sayable.ts";

/*
 * The fault Giles heard on the first real call. Nobody can write down "https
 * colon slash slash..." while holding a phone.
 */
test("a link is taken out of what is said and kept to be texted", () => {
  const out = sayable(
    "You're booked in. Everything you need is here: https://www.second-pair.com/b/abc123",
  );
  assert.ok(!out.said.includes("http"));
  assert.ok(!out.said.includes("second-pair"));
  assert.deepEqual(out.links, ["https://www.second-pair.com/b/abc123"]);
  assert.match(out.said, /I will text you the link/);
});

test("a bare domain counts as a link", () => {
  const out = sayable("Our privacy notice is at second-pair.com/privacy.");
  assert.ok(!out.said.includes("second-pair.com"));
  assert.equal(out.links.length, 1);
});

test("several links are all taken and mentioned once", () => {
  const out = sayable("Details: https://a.com/x and the deposit: https://b.com/y");
  assert.equal(out.links.length, 2);
  assert.match(out.said, /I will text you the links\./);
  assert.equal((out.said.match(/I will text you/g) ?? []).length, 1);
});

/*
 * "Everything you need is here: — any questions, just ask" is what a naive
 * strip produces, and it sounds like a fault.
 */
test("it does not leave punctuation pointing at nothing", () => {
  const out = sayable("Everything is here: https://x.com/a. Any questions, just ask.");
  assert.ok(!out.said.includes(": ."));
  assert.ok(!out.said.includes("  "));
  assert.ok(!/\s[.,]/.test(out.said));
});

test("a reply with no link is left exactly as it was", () => {
  const plain = "You're booked in for Friday at ten with Karen.";
  assert.deepEqual(sayable(plain), { said: plain, links: [] });
});

/*
 * A reply that is nothing but a link still has to say something, or the call
 * goes silent at the moment it matters most.
 */
test("a reply that is only a link still says something", () => {
  const out = sayable("https://www.second-pair.com/b/abc");
  assert.equal(out.said, "I will text you the link.");
  assert.equal(out.links.length, 1);
});
