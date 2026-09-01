import { test } from "node:test";
import assert from "node:assert/strict";
import { renderReminder, unknownPlaceholders } from "./reminderText.ts";
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
