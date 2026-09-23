import { test } from "node:test";
import assert from "node:assert/strict";
import { reminderCover, whatIsMissing, whoSendsFewer, type CoverPerson } from "./reminderCover.ts";

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

/*
 * Confirmations.
 *
 * A confirmation is a template at zero hours before. It goes out as somebody
 * books, which means it covers nobody for the thing this file is about — and
 * counting it would put the settings screen back into the exact state it was
 * written to expose: a template listed, the page reading as set up, and nobody
 * reminded on the day.
 */
test("a confirmation is not a reminder, and does not cover anybody", () => {
  const cover = reminderCover([{ artist_id: null, hours_before: 0 }], [person("Sarah")]);
  assert.equal(cover.businessWide, 0);
  assert.equal(cover.confirming, true);
  assert.deepEqual(cover.sendingNothing, ["Sarah"]);
  assert.match(said(whatIsMissing(cover)), /Nothing is sent before an appointment with Sarah\./);
});

test("a confirmation beside a real reminder leaves everybody covered", () => {
  const cover = reminderCover(
    [{ artist_id: null, hours_before: 0 }, { artist_id: null, hours_before: 24 }],
    [person("Sarah")],
  );
  assert.equal(cover.businessWide, 1);
  assert.equal(cover.confirming, true);
  assert.deepEqual(cover.sendingNothing, []);
});

test("a disabled confirmation is not confirming", () => {
  const cover = reminderCover([{ artist_id: null, hours_before: 0, enabled: false }], []);
  assert.equal(cover.confirming, false);
});

/*
 * Every template written before confirmations existed has a positive
 * hours_before, and callers that have not been told about the column pass none
 * at all. Absence must keep counting as a reminder, or the day this shipped
 * every business on the platform would have been told nobody was covered.
 */
test("a template with no hours given still counts as a reminder", () => {
  const cover = reminderCover([{ artist_id: null }], [person("Sarah")]);
  assert.equal(cover.businessWide, 1);
  assert.equal(cover.confirming, false);
  assert.deepEqual(cover.sendingNothing, []);
});

/*
 * The gap Giles found: "the team members dont seem to have the same reminders
 * set up as the owner." Aisha has one of her own and the shop sends two, so
 * her clients get half of what everybody else's get — and nothing anywhere
 * said so, because the page only ever warned about sending nothing.
 */
test("somebody sending fewer than the business is noticed", () => {
  const cover = reminderCover(
    [
      { artist_id: null, hours_before: 24 },
      { artist_id: null, hours_before: 2 },
      { artist_id: "aisha", hours_before: 24 },
    ],
    [
      { id: "aisha", name: "Aisha", active: true, ownReminders: true },
      { id: "sarah", name: "Sarah", active: true, ownReminders: false },
    ],
  );

  assert.deepEqual(cover.sendingFewer, [{ name: "Aisha", theirs: 1 }]);
  const line = whoSendsFewer(cover);
  assert.match(line ?? "", /Aisha sends one/);
  assert.match(line ?? "", /business sends two/);
});

test("matching the business is not worth saying", () => {
  const cover = reminderCover(
    [
      { artist_id: null, hours_before: 24 },
      { artist_id: "aisha", hours_before: 24 },
    ],
    [{ id: "aisha", name: "Aisha", active: true, ownReminders: true }],
  );
  assert.deepEqual(cover.sendingFewer, []);
  assert.equal(whoSendsFewer(cover), null);
});

/*
 * Somebody doing more than the shop has decided to do more. Telling an owner
 * about that is telling them off for trying.
 */
test("sending more than the business is never flagged", () => {
  const cover = reminderCover(
    [
      { artist_id: null, hours_before: 24 },
      { artist_id: "aisha", hours_before: 24 },
      { artist_id: "aisha", hours_before: 2 },
    ],
    [{ id: "aisha", name: "Aisha", active: true, ownReminders: true }],
  );
  assert.deepEqual(cover.sendingFewer, []);
});

/* Sending nothing is the louder warning and stays the only one for that person. */
test("somebody sending nothing is not also listed as sending fewer", () => {
  const cover = reminderCover(
    [{ artist_id: null, hours_before: 24 }],
    [{ id: "aisha", name: "Aisha", active: true, ownReminders: true }],
  );
  assert.deepEqual(cover.sendingNothing, ["Aisha"]);
  assert.deepEqual(cover.sendingFewer, []);
});

/* The confirmation is not a reminder, so it cannot make the counts look even. */
test("a confirmation does not count towards either side", () => {
  const cover = reminderCover(
    [
      { artist_id: null, hours_before: 0 },
      { artist_id: null, hours_before: 24 },
      { artist_id: "aisha", hours_before: 24 },
      { artist_id: "aisha", hours_before: 0 },
    ],
    [{ id: "aisha", name: "Aisha", active: true, ownReminders: true }],
  );
  assert.deepEqual(cover.sendingFewer, []);
});
