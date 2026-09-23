import { test } from "node:test";
import assert from "node:assert/strict";
import { renderReminder, unknownPlaceholders , segments, forOneText } from "./reminderText.ts";
import { VERTICAL_LIST } from "./verticals.ts";

const values = {
  name: "Priya",
  practitioner: "Sarah",
  business: "The Fold Hair",
  when: "tomorrow at 3pm",
};

test("it fills what it is given", () => {
  assert.equal(
    renderReminder("Hi {{name}}, you are with {{practitioner}} at {{business}} {{when}}.", values),
    "Hi Priya, you are with Sarah at The Fold Hair tomorrow at 3pm.",
  );
});

test("spacing and capitals inside the braces do not matter", () => {
  assert.equal(renderReminder("Hi {{ Name }}, see you {{WHEN}}.", values), "Hi Priya, see you tomorrow at 3pm.");
});

test("the same placeholder twice is filled twice", () => {
  assert.equal(renderReminder("{{name}}, {{name}}!", values), "Priya, Priya!");
});

// ------------------------------------------------------ when something is missing

test("no name is 'there', not a blank", () => {
  assert.equal(renderReminder("Hi {{name}},", { ...values, name: null }), "Hi there,");
  assert.equal(renderReminder("Hi {{name}},", { ...values, name: "   " }), "Hi there,");
});

test("no practitioner or business falls back to 'us'", () => {
  assert.equal(
    renderReminder("with {{practitioner}} at {{business}}", { practitioner: null, business: null }),
    "with us at us",
  );
});

test("no time is 'your appointment' rather than nothing", () => {
  assert.equal(renderReminder("See you {{when}}.", { when: null }), "See you your appointment.");
});

// ------------------------------------------------- what must never reach a customer

test("an unknown placeholder is removed, not shown", () => {
  // A client seeing "{{firstname}}" is worse than a plainer sentence.
  assert.equal(renderReminder("Hi {{firstname}}, see you soon.", values), "Hi , see you soon.");
});

test("stripping does not leave double spaces behind", () => {
  assert.equal(renderReminder("Hi {{oops}} there   friend", values), "Hi there friend");
});

test("nothing with braces survives", () => {
  const out = renderReminder("{{a}} {{b_c}} {{ d }} {{name}}", values);
  assert.doesNotMatch(out, /\{\{|\}\}/);
  assert.match(out, /Priya/);
});

// ------------------------------------------------------- the templates we ship

test("every trade pack reminder uses only placeholders that exist", () => {
  const broken: string[] = [];
  for (const trade of VERTICAL_LIST) {
    for (const reminder of trade.reminders) {
      const unknown = unknownPlaceholders(reminder.body);
      if (unknown.length) broken.push(`${trade.id} "${reminder.label}": ${unknown.join(", ")}`);
    }
  }
  assert.deepEqual(broken, [], `these would go out with a hole in them:\n${broken.join("\n")}`);
});

test("every shipped reminder still says something once filled", () => {
  const broken: string[] = [];
  for (const trade of VERTICAL_LIST) {
    for (const reminder of trade.reminders) {
      const out = renderReminder(reminder.body, values);
      if (out.length < 20) broken.push(`${trade.id} "${reminder.label}": ${out.length} chars`);
      if (/\{\{|\}\}/.test(out)) broken.push(`${trade.id} "${reminder.label}": braces survived`);
    }
  }
  assert.deepEqual(broken, []);
});

test("a shipped reminder reads properly with nothing known about the client", () => {
  // The worst case in practice: somebody booked over the phone with a first
  // name and nothing else.
  for (const trade of VERTICAL_LIST) {
    for (const reminder of trade.reminders) {
      const out = renderReminder(reminder.body, {});
      assert.doesNotMatch(out, /\{\{|\}\}/, `${trade.id}/${reminder.label}`);
      assert.doesNotMatch(out, /\s{2,}/, `${trade.id}/${reminder.label} has a gap in it`);
    }
  }
});

test("a text is counted the way it is charged", () => {
  assert.equal(segments(""), 0);
  assert.equal(segments("a".repeat(160)), 1);
  assert.equal(segments("a".repeat(161)), 2);
  // One curly quote drops the whole message to 70 characters a piece.
  assert.equal(segments("a".repeat(100) + "\u2019"), 2, "a smart apostrophe is not GSM");
  assert.equal(segments("See you tomorrow, John \u2014 Karen will be with you at 11am."), 1);
});

/*
 * Measured on the live database: the earlier reminder carries the trade's prep
 * advice and runs to about 210 characters, so every one is charged as two.
 */
test("a long reminder is cut to one text, and only between sentences", () => {
  const long =
    "Hi John, Karen Foster from Neat & Tidy Solutions is booked to come out to you Thursday 17 September at 11:00 am. " +
    "Please make sure there's somewhere to park and access to the work. Need to move it? Just reply here.";
  assert.equal(segments(long), 2);

  const short = forOneText(long);
  assert.equal(segments(short), 1);
  assert.match(short, /Thursday 17 September at 11:00 am\./, "who and when survive");
  assert.doesNotMatch(short, /somewhere to park/, "the advice goes, and the email still carries it");
  assert.equal(short.endsWith("."), true, "it never stops mid-sentence");
});

test("a reminder that already fits is left exactly as it is", () => {
  const fine = "See you tomorrow, John - Karen will be with you Thursday at 11:00 am. Reply here if anything's changed.";
  assert.equal(forOneText(fine), fine);
});

test("a single sentence too long for one text is sent whole rather than cut off", () => {
  const one = "Hi " + "a".repeat(200) + ".";
  assert.equal(forOneText(one), one);
});

/*
 * The link to the customer's own page.
 *
 * Optional in a text and automatic in an email, so the template has to cope
 * with it being absent — a booking made before the page existed has no token,
 * and a sentence containing the word "undefined" reaches a real customer.
 */
test("the link is filled when there is one", () => {
  assert.equal(
    renderReminder("See you {{when}}: {{link}}", {
      when: "tomorrow at 2pm",
      link: "https://x.test/b/abc",
    }),
    "See you tomorrow at 2pm: https://x.test/b/abc",
  );
});

test("a template asking for a link there is none for does not say undefined", () => {
  const out = renderReminder("See you {{when}}. {{link}}", { when: "tomorrow" });
  assert.doesNotMatch(out, /undefined/);
  assert.doesNotMatch(out, /\{\{/);
  assert.equal(out, "See you tomorrow.");
});

test("link is a known placeholder, so the editor does not warn about it", () => {
  assert.deepEqual(unknownPlaceholders("{{link}} and {{name}}"), []);
  assert.deepEqual(unknownPlaceholders("{{lnik}}"), ["lnik"]);
});
