import { test } from "node:test";
import assert from "node:assert/strict";
import { reminderCover, whatIsMissing, type CoverPerson } from "./reminderCover.ts";

/** What it says, having first insisted it says anything at all. */
const said = (value: string | null): string => {
  assert.ok(value, "expected something to be missing, and nothing was reported");
  return value;
};

const person = (name: string, extra: Partial<CoverPerson> = {}): CoverPerson => ({
  id: name.toLowerCase(),
  name,
  active: true,
  ownReminders: false,
  ...extra,
});

test("a business with its own reminders covers everybody", () => {
  const cover = reminderCover(
    [{ artist_id: null }, { artist_id: null }],
    [person("Sarah"), person("Mo")],
  );
  assert.equal(cover.businessWide, 2);
  assert.deepEqual(cover.sendingNothing, []);
  assert.equal(whatIsMissing(cover), null);
});

/*
 * The state Willow & Co was in: one template, Aisha's, and five stylists whose
 * clients were reminded of nothing. The page showed a reminder and looked done.
 */
test("one person's own reminder and nothing for the business leaves everybody else", () => {
  const cover = reminderCover(
    [{ artist_id: "aisha" }],
    [
      person("Aisha", { id: "aisha", ownReminders: true }),
      person("Sarah"),
      person("Mo"),
    ],
  );

  assert.equal(cover.businessWide, 0);
  assert.deepEqual(cover.onTheirOwn, ["Aisha"]);
  assert.deepEqual(cover.sendingNothing, ["Sarah", "Mo"]);

  const sentence = said(whatIsMissing(cover));
  assert.match(sentence, /no reminder for the business/);
  assert.match(sentence, /Sarah and Mo/);
  // Aisha is covered and must not be named as if she were not.
  assert.doesNotMatch(sentence.split("only")[1] ?? "", /with .*Aisha/);
});

test("somebody set to their own who has not written one is sending nothing", () => {
  const cover = reminderCover(
    [{ artist_id: null }],
    [person("Priya", { ownReminders: true })],
  );
  assert.deepEqual(cover.sendingNothing, ["Priya"]);
  assert.match(said(whatIsMissing(cover)), /Nothing is sent before an appointment with Priya\./);
});

test("somebody who has left is not counted", () => {
  const cover = reminderCover([], [person("Gone", { active: false })]);
  assert.deepEqual(cover.sendingNothing, []);
  assert.equal(whatIsMissing(cover), null);
});

test("a disabled template is a draft, not a reminder", () => {
  const cover = reminderCover([{ artist_id: null, enabled: false }], [person("Sarah")]);
  assert.equal(cover.businessWide, 0);
  assert.deepEqual(cover.sendingNothing, ["Sarah"]);
});

test("three or more are listed properly rather than run together", () => {
  const cover = reminderCover([], [person("Sarah"), person("Mo"), person("Chen")]);
  assert.match(said(whatIsMissing(cover)), /Sarah, Mo and Chen/);
});
