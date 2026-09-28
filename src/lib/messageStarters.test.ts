import { test } from "node:test";
import assert from "node:assert/strict";
import { confirmationStarters, reminderStarters, startersFor } from "./messageStarters.ts";
import { renderReminder } from "./reminderText.ts";
import { unknownIn } from "./messageFields.ts";
import { segments } from "./reminderText.ts";

const SHOP = { travels: false };
const OUT = { travels: true };

const every = [
  ...confirmationStarters(SHOP),
  ...confirmationStarters(OUT),
  ...reminderStarters(SHOP),
  ...reminderStarters(OUT),
];

/*
 * The fault this guards against is the one that shipped on the marketing
 * screen: an example wording using a field nothing fills. A starter is worse
 * than an example, because it is saved and sent rather than read and retyped.
 */
test("no starter uses a field a reminder cannot fill", () => {
  for (const s of every) {
    assert.deepEqual(unknownIn(s.body, "reminder"), [], `${s.label}: ${s.body}`);
  }
});

test("every starter still says something once it is filled in", () => {
  for (const s of every) {
    const out = renderReminder(s.body, {
      name: "Marie",
      practitioner: "Amber",
      business: "Amber's Paws & Pastures",
      when: "tomorrow at 2pm",
      link: "https://www.second-pair.com/b/example",
    });
    assert.ok(!out.includes("{{"), `${s.label} left braces behind: ${out}`);
    assert.ok(out.length > 30, `${s.label} came out too thin: ${out}`);
    assert.doesNotMatch(out, / {2}/, `${s.label} left a double space: ${out}`);
  }
});

/*
 * And with nothing known about them, which is the walk-in case. The renderer
 * substitutes "there" and "us" rather than blanks, so the sentence has to still
 * read as English — "See you tomorrow, there" would be worse than no reminder.
 */
test("a starter reads properly for somebody whose name nobody took", () => {
  for (const s of every) {
    const out = renderReminder(s.body, { business: "Amber's Paws & Pastures" });
    assert.ok(!out.includes("{{"), s.label);
    assert.doesNotMatch(out, /,\s*\./, `${s.label} left a stranded comma: ${out}`);
    assert.doesNotMatch(out, / {2}/, `${s.label} left a double space: ${out}`);
  }
});

/*
 * Cost, because a starter is the wording most businesses will keep. Two texts
 * at two hundred appointments a month is real money, so anything over one is a
 * deliberate choice rather than an accident of drafting.
 *
 * The two long ones are deliberate: the "couple of days before" carries the
 * trade's preparation advice, and forOneText cuts a text down to one segment on
 * the way out while the email carries it whole.
 */
/*
 * No starter carries a character that doubles the price of the text.
 *
 * Written after the version of this file that did. The first draft used an em
 * dash in six of the twelve wordings, and the one-text check below only looked
 * at two of them — so four went past it. One character outside the GSM alphabet
 * takes a text from 160 characters to 70, which is the fault that had been
 * quietly costing every business double on its day-before reminder since
 * August. A starter is the wording most businesses will keep, so this is the
 * cheapest possible place to catch it.
 *
 * Also the rule Giles set for everything a customer reads: no long dashes.
 */
test("no starter carries a character that doubles the price of a text", () => {
  for (const s of every) {
    const odd = [...new Set([...s.body].filter((c) => c.charCodeAt(0) > 127))];
    assert.deepEqual(odd, [], `${s.label} would be charged as two texts: ${odd.join(" ")}`);
  }
});

test("the short starters fit in one text", () => {
  const filled = (body: string) =>
    renderReminder(body, {
      name: "Marie",
      practitioner: "Amber",
      business: "Amber's Paws",
      when: "tomorrow at 2pm",
      link: "https://www.second-pair.com/b/example",
    });

  assert.equal(segments(filled(confirmationStarters(SHOP)[0].body)), 1, "short and plain");
  assert.equal(segments(filled(reminderStarters(SHOP)[0].body)), 1, "the day before");
});

test("a business that travels is not told the customer is coming to them", () => {
  for (const s of confirmationStarters(OUT)) {
    assert.doesNotMatch(s.body, /booked in with|you're in with|you're in /i, s.label);
  }
  /* And the other way round: a salon is not told somebody is coming out. */
  for (const s of confirmationStarters(SHOP)) {
    assert.doesNotMatch(s.body, /come out to you|will be with you/i, s.label);
  }
});

test("a confirmation never talks as though the appointment has passed", () => {
  for (const s of confirmationStarters(SHOP)) {
    assert.doesNotMatch(s.body, /see you tomorrow|it has been a while/i, s.label);
  }
});

test("which set you get follows the question the editor asks", () => {
  assert.deepEqual(startersFor(true, SHOP), confirmationStarters(SHOP));
  assert.deepEqual(startersFor(false, OUT), reminderStarters(OUT));
});

test("each set offers three, and every one is named", () => {
  for (const set of [confirmationStarters(SHOP), reminderStarters(OUT)]) {
    assert.equal(set.length, 3);
    for (const s of set) assert.ok(s.label.length > 2, s.body);
  }
});

/* No starter invents a price, a notice period or anything else a business would
 * have to correct before it was safe to send. */
test("no starter invents a figure or a policy", () => {
  for (const s of every) {
    assert.doesNotMatch(s.body, /£|\d+ ?(hours?|days?) ?(notice|before)|deposit/i, s.label);
  }
});
