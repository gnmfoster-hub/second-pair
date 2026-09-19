import { test } from "node:test";
import assert from "node:assert/strict";
import { neverSay } from "./neverSay.ts";

const what = (reply: string) => neverSay(reply).map((s) => s.what);

/* Every one of these is a real reply that went to a real customer. */

test("the reasoning Living Canvas sent to a Shopify address", () => {
  const said =
    "Quick note: this inbox is handled by Living Canvas Tattoo's assistant. " +
    "This one's an automated Shopify order notification — no need for tools or a name here. " +
    "Hi Ayera — thanks for the offer, but we're not looking for SEO work.";
  assert.ok(what(said).some((w) => w.includes("narrates")), what(said).join("; "));
});

test("the empty price list quoting nothing", () => {
  assert.ok(what("That'd be £0 to £0 for a piece that size.").some((w) => w.includes("quotes nothing")));
  assert.ok(what("Good news — it's free!").some((w) => w.includes("quotes nothing")));
});

test("the business with no hours saying it was full", () => {
  assert.ok(
    what("We're fully booked for the next three weeks I'm afraid.").some((w) => w.includes("full or closed")),
  );
});

test("promising a channel it may not have", () => {
  assert.ok(what("No problem, I'll text you the times shortly.").some((w) => w.includes("promises to text")));
});

test("the machinery, and the lie", () => {
  assert.ok(what("Sorry, the database is not responding.").some((w) => w.includes("blames the system")));
  assert.ok(what("No, I'm a real person!").some((w) => w.includes("claims to be a person")));
});

/*
 * What matters more than any of the above: an ordinary good reply has nothing
 * wrong with it. A checker that cries wolf on real work gets switched off, and
 * then none of the rules above are running either.
 */
test("a good reply trips nothing", () => {
  for (const said of [
    "Deep clean's usually £100–£160, John — an estimate Karen confirms when she's seen the place. What's the postcode?",
    "Karen's got Monday 21st at 10am or 4pm, or Tuesday 22nd at 1:30pm — any good?",
    "We're closed Saturdays I'm afraid — Monday to Friday, 10 to 6. What sort of clean are you after?",
    "I'm an assistant that answers for the studio, and a human sees everything. What can I help with?",
    "That's £40 an hour with Karen, products included. Is it a regular tidy-up or a deep clean?",
    "Can I take your name and the best number for you, and I'll get that booked in?",
  ]) {
    assert.deepEqual(neverSay(said), [], `flagged: "${said}"`);
  }
});

test("two faults in one reply are both reported", () => {
  const said = "This one's an automated notification — no need for tools here. It's free anyway.";
  assert.equal(neverSay(said).length, 2, JSON.stringify(neverSay(said)));
});
