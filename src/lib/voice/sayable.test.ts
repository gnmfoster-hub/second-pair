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
  assert.match(out.said, /I will text you your booking page/);
});

test("a bare domain counts as a link", () => {
  const out = sayable("Our privacy notice is at second-pair.com/privacy.");
  assert.ok(!out.said.includes("second-pair.com"));
  assert.equal(out.links.length, 1);
});

test("several links are all taken and promised once", () => {
  const out = sayable("Details: https://a.com/x and the deposit: https://b.com/pay/y");
  assert.equal(out.links.length, 2);
  /* One promise, however many links, or it sounds like a machine listing. */
  assert.equal((out.said.match(/I will text you/g) ?? []).length, 1);
  assert.match(out.said, /deposit/);
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
  assert.match(out.said, /^I will text you your booking page/);
  assert.equal(out.links.length, 1);
});

/*
 * Giles again, on the fix rather than the fault: "i said text the link but
 * didnt say why, it was confusing." A caller who does not know what is coming
 * does not watch for it arriving.
 */
test("it says what the link actually is", () => {
  assert.match(
    sayable("Here you go: https://www.second-pair.com/b/abc123").said,
    /your booking page, where you can change it/,
  );
  assert.match(sayable("Our notice: https://x.com/privacy").said, /our privacy notice/);
  assert.match(sayable("Pay here: https://x.com/pay/abc").said, /pay the deposit/);
});

test("two different kinds are both named", () => {
  const said = sayable("https://a.com/b/one and https://a.com/pay/two").said;
  assert.match(said, /booking page/);
  assert.match(said, /deposit/);
  assert.match(said, / and /);
});

test("the same kind twice is said once", () => {
  const said = sayable("https://a.com/b/one https://a.com/b/two").said;
  assert.equal((said.match(/booking page/g) ?? []).length, 1);
});

test("something unrecognised is still promised, plainly", () => {
  assert.match(sayable("Have a look: https://example.com/thing").said, /I will text you the link\./);
});
