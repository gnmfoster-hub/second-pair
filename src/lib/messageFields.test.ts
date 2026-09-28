import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MESSAGE_FIELDS,
  fieldNames,
  sayTheFields,
  unknownIn,
  type MessageKind,
} from "./messageFields.ts";
import { renderReminder } from "./reminderText.ts";

/**
 * The rule this file exists to keep.
 *
 * A field offered on a screen must be a field something fills. Both faults
 * found on 28 September were breaches of it in opposite directions: campaigns
 * advertised {{what}}, which nothing filled, and quick messages advertised
 * {{when}} and {{link}}, which that screen cannot fill.
 */
const KINDS: MessageKind[] = ["reminder", "campaign", "quick"];

test("every field offered can actually be filled by the renderer", () => {
  for (const kind of KINDS) {
    for (const field of MESSAGE_FIELDS[kind]) {
      const out = renderReminder(`[${`{{${field.name}}}`}]`, {
        name: "Marie",
        practitioner: "Amber",
        business: "Amber's Paws",
        when: "tomorrow at 2pm",
        link: "https://example.com/b/1",
        what: "a cat visit",
      });
      assert.notEqual(
        out,
        "[]",
        `${kind} offers {{${field.name}}} and the renderer strips it — that is the campaign {{what}} bug again`,
      );
    }
  }
});

test("a field is never offered to a kind that has no value for it", () => {
  /*
   * A campaign follows a job that has already happened, so there is no
   * appointment to link to and no time to give. Offering either would put a
   * date in a sentence about the past.
   */
  assert.ok(!fieldNames("campaign").includes("when"));
  assert.ok(!fieldNames("campaign").includes("link"));
  /* A message typed by hand is attached to a person and nothing else. */
  assert.ok(!fieldNames("quick").includes("when"));
  assert.ok(!fieldNames("quick").includes("link"));
});

test("a reminder knows everything, because it is attached to the appointment", () => {
  for (const wanted of ["name", "when", "practitioner", "business", "link"]) {
    assert.ok(fieldNames("reminder").includes(wanted), wanted);
  }
});

/* The field the campaign screen recommended and nothing filled. */
test("what they had is a real field on a campaign", () => {
  assert.ok(fieldNames("campaign").includes("what"));
  assert.equal(
    renderReminder("since your {{what}}", { what: "colour" }),
    "since your colour",
  );
});

test("an unknown field is named, per kind", () => {
  assert.deepEqual(unknownIn("{{name}} {{when}}", "reminder"), []);
  assert.deepEqual(unknownIn("{{lnik}}", "reminder"), ["lnik"]);
  /* The same template is fine for one kind and wrong for another. */
  assert.deepEqual(unknownIn("{{when}}", "campaign"), ["when"]);
  assert.deepEqual(unknownIn("{{when}}", "reminder"), []);
});

test("a field is only reported once however often it is used", () => {
  assert.deepEqual(unknownIn("{{lnik}} and {{lnik}} again", "reminder"), ["lnik"]);
});

/*
 * The sentence that was wrong on the screen: "the four above are the whole
 * list", printed under a list of five.
 */
test("the list is said out loud rather than counted", () => {
  assert.equal(
    sayTheFields("reminder"),
    "{{name}}, {{when}}, {{practitioner}}, {{business}} and {{link}}",
  );
  assert.equal(sayTheFields("campaign"), "{{name}}, {{what}} and {{business}}");
});

test("every field says what it means and gives an example, for the buttons", () => {
  for (const kind of KINDS) {
    for (const field of MESSAGE_FIELDS[kind]) {
      assert.ok(field.means.length > 3, `${kind}/${field.name} needs explaining`);
      assert.ok(field.example.length > 0, `${kind}/${field.name} needs an example`);
    }
  }
});
