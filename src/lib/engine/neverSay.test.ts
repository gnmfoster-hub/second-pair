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
    "Deep clean's usually £100-£160, John. An estimate Karen confirms when she's seen the place. What's the postcode?",
    "Karen's got Monday 21st at 10am or 4pm, or Tuesday 22nd at 1:30pm. Any good?",
    "We're closed Saturdays I'm afraid. Monday to Friday, 10 to 6. What sort of clean are you after?",
    "I'm an assistant that answers for the studio, and a human sees everything. What can I help with?",
    "That's £40 an hour with Karen, products included. Is it a regular tidy-up or a deep clean?",
    "Can I take your name and the best number for you, and I'll get that booked in?",
  ]) {
    assert.deepEqual(neverSay(said), [], `flagged: "${said}"`);
  }
});

/*
 * Both of them, not a count of them.
 *
 * This asserted the list was exactly two long, so adding any new rule broke a
 * test about two entirely different rules. What it is about is that neither
 * fault hides the other.
 */
test("two faults in one reply are both reported", () => {
  const said = "This one's an automated notification, no need for tools here. It's free anyway.";
  const what = neverSay(said).map((s) => s.what);
  assert.ok(what.some((w) => /narrates/.test(w)), JSON.stringify(what));
  assert.ok(what.some((w) => /free/.test(w)), JSON.stringify(what));
});

/*
 * The cancellation it cannot make.
 *
 * Every sentence below was actually said by the assistant to the garage demo
 * on the night this rule was written — the bad one and the careful ones — so
 * the rule is measured against real replies rather than invented ones.
 */
test("a cancellation it claims to have made is caught", () => {
  const slips = neverSay(
    "Done — that's cancelled, Dawn. Monday 8am is off the diary and nobody will be expecting the Golf.",
  );
  assert.ok(slips.some((s) => /cancelled/.test(s.what)), JSON.stringify(slips));
});

test("handing a cancellation to a person is not a claim to have made one", () => {
  const fine = [
    "No problem at all, Dawn — I can't cancel it from here, so I've passed it straight to the garage to take off the diary.",
    "It's with the garage but it isn't cancelled yet. Somebody will confirm once they've actually taken it out of the book.",
    "That's with the garage now, Dawn. Somebody will confirm once it's actually out of the book — it isn't cancelled until you hear back.",
    "Done — that's with the garage now, so Monday 8am is coming out of the diary.",
    "No bother, Dawn. I've passed it to the garage to take that Monday 8am off the diary.",
    "If you need to cancel, just give us a ring and we'll sort it.",
    "We hold the bay for half an hour, then it goes to somebody else.",
  ];

  /*
   * About the cancellation rule, not about everything.
   *
   * This asserted that nothing at all was objected to, and three of these real
   * replies use a long dash, which the dash rule now catches — correctly, and
   * with no bearing on whether they claim to have cancelled anything. A test
   * that breaks when an unrelated rule is added is testing the list rather
   * than the thing it is named after.
   */
  for (const said of fine) {
    const claimed = neverSay(said).filter((s) => /cancelled/.test(s.what));
    assert.deepEqual(claimed, [], `should not have read as a cancellation: ${said}`);
  }
});

/*
 * The long dash, which Giles spotted in a week of real replies: "it makes it
 * look very AI". It is the commonest tell in everything this writes.
 */
test("a sentence joined with a long dash is caught", () => {
  for (const said of [
    "Booked, Dawn — Monday 21 September at 8:00am with Pete.",
    "We do — balayage with Nadia is usually £120 to £160.",
    "She's got three Saturdays going – which suits?",
  ]) {
    const slips = neverSay(said);
    assert.ok(
      slips.some((s) => /long dash/.test(s.what)),
      `let through: ${said}`,
    );
  }
});

/* And the dashes that are not that, which must all survive. */
test("a price range, a time range and a hyphen are not the long dash", () => {
  for (const fine of [
    "Balayage is £120-£160 depending on your length.",
    "We're open 9am-5pm Monday to Friday.",
    "It's a deep-clean, not a normal one.",
    "Booked, Dawn. Monday 21 September at 8:00am with Pete.",
    "That's a 2019 Golf, reg BD70 XNT.",
  ]) {
    assert.ok(
      !neverSay(fine).some((s) => /long dash/.test(s.what)),
      `objected to: ${fine}`,
    );
  }
});

/*
 * Hours that contradict themselves inside one sentence.
 *
 * Found by reading what the demos actually said, not reported. Dan's Driving
 * School, asked about Sundays: "Dan's out Monday to Friday, and Saturday
 * mornings up to 3pm." Saturday is nine until three, so the hours are right and
 * the word is wrong, and somebody reading it cannot tell which half to believe.
 * They turn up at one o'clock to a closed door, or do not ring at two.
 */
test("an afternoon described as a morning is caught", () => {
  for (const said of [
    "Dan's out Monday to Friday, and Saturday mornings up to 3pm.",
    "We do Saturday mornings until 4pm.",
    "Open mornings till 1:30pm on a Saturday.",
  ]) {
    assert.ok(
      neverSay(said).some((s) => /morning/.test(s.what)),
      `let through: ${said}`,
    );
  }
});

/* And the ones that say something true, which must all survive. */
test("a real morning is not a contradiction", () => {
  for (const fine of [
    "Saturday mornings 8:30 till 12:30.",
    "We're mornings only, back at 2pm if you'd rather come then.",
    "Kerry's got Tuesday morning at 8:30am or the afternoon at 12:30pm.",
    "Open 9am to 3pm on Saturdays.",
  ]) {
    assert.ok(
      !neverSay(fine).some((s) => /morning/.test(s.what)),
      `objected to: ${fine}`,
    );
  }
});
