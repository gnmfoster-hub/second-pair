import { test } from "node:test";
import assert from "node:assert/strict";
import {
  readDate,
  readYesNo,
  readFact,
  whatBlocks,
  stillToAsk,
  dueSoon,
  describeFact,
  blockedBy,
  type TradeFact,
} from "./tradeFacts.ts";

const now = new Date("2026-09-17T09:00:00Z");

const vaccination: TradeFact = {
  key: "vaccination_due",
  label: "Vaccination expires",
  type: "date",
  ask: "when their vaccinations run out",
  blocks: "expired",
};

const mot: TradeFact = {
  key: "mot_due",
  label: "MOT due",
  type: "date",
  ask: "when the MOT runs out",
  remindBefore: 45,
};

test("a date is read the way somebody types it", () => {
  assert.equal(readDate("2027-03-03"), "2027-03-03");
  assert.equal(readDate("3 March 2027"), "2027-03-03");
  assert.equal(readDate("03/03/2027"), "2027-03-03");
  // Day first: this is the United Kingdom.
  assert.equal(readDate("04/05/2027"), "2027-05-04");
  assert.equal(readDate("4/5/27"), "2027-05-04");
  assert.equal(readDate(""), null);
  assert.equal(readDate("sometime next year"), null);
  assert.equal(readDate("13/13/2027"), null, "a month that does not exist is not a date");
});

test("yes and no, and never a guess", () => {
  assert.equal(readYesNo("yes"), true);
  assert.equal(readYesNo("Nope"), false);
  assert.equal(readYesNo("not sure"), null, "unsure is not no");
  assert.equal(readYesNo(""), null);
});

test("an answer is cleaned up for storage", () => {
  assert.equal(readFact(mot, " 3 March 2027 "), "2027-03-03");
  assert.equal(readFact({ key: "mileage", label: "Mileage", type: "number" }, "84,300 miles"), 84300);
  assert.equal(readFact({ key: "reg", label: "Registration", type: "text" }, "  AB12 CDE "), "AB12 CDE");
  assert.equal(readFact(mot, "whenever"), null, "rubbish is not stored as if it were an answer");
});

/*
 * The whole point of the feature: a groomer cannot take a dog whose
 * vaccinations have run out, and neither can they take one where nobody knows.
 * Both are the same risk and both stop the booking.
 */
test("an expired vaccination stops the booking, and so does an unknown one", () => {
  assert.deepEqual(whatBlocks([vaccination], { vaccination_due: "2027-03-03" }, now), []);

  const expired = whatBlocks([vaccination], { vaccination_due: "2026-08-01" }, now);
  assert.equal(expired.length, 1);
  assert.match(expired[0], /ran out on 2026-08-01/);

  const unknown = whatBlocks([vaccination], {}, now);
  assert.equal(unknown.length, 1);
  assert.match(unknown[0], /is not recorded/);
});

test("a fact that does not block never stops anybody", () => {
  assert.deepEqual(whatBlocks([mot], {}, now), [], "an unknown MOT is not a reason to refuse a service");
});

test("what is still to ask, in the trade's own words", () => {
  assert.deepEqual(stillToAsk([vaccination, mot], { mot_due: "2027-01-01" }), [
    "when their vaccinations run out",
  ]);
  assert.deepEqual(stillToAsk([vaccination], { vaccination_due: "2027-03-03" }), []);
});

/*
 * The DVSA texts every motorist free, one month before. A garage's reminder is
 * worth nothing unless it lands earlier — so 45 days, and a window rather than
 * an exact day so a missed night catches up instead of missing it by a year.
 */
test("an MOT is mentioned before the government mentions it", () => {
  const due = dueSoon([mot], { mot_due: "2026-11-01" }, now);
  assert.equal(due.length, 1);
  assert.equal(due[0].daysAway, 45);

  assert.deepEqual(dueSoon([mot], { mot_due: "2026-12-25" }, now), [], "too far off yet");
  assert.deepEqual(dueSoon([mot], { mot_due: "2026-09-20" }, now), [], "already inside the window, said last month");
});

test("a missed night catches up the next", () => {
  const late = dueSoon([mot], { mot_due: "2026-10-31" }, now);
  assert.equal(late.length, 1, "44 days away is still inside the three-day window");
});

test("it reads as a sentence, not as a field", () => {
  assert.equal(describeFact(vaccination, "2027-03-03"), "Vaccination expires: 3 March 2027");
  assert.equal(
    describeFact({ key: "neutered", label: "Neutered", type: "yesno" }, true),
    "Neutered: yes",
  );
  assert.equal(describeFact(vaccination, null), null, "nothing known says nothing at all");
});

/*
 * A boiler is the other way round: nobody writes down when the next service is
 * due, they write down when the last one happened. A negative remindBefore is
 * how that is said, and it has to land eleven months later rather than never.
 */
test("a reminder can count forward from something that already happened", () => {
  const serviced: TradeFact = {
    key: "serviced",
    label: "Last serviced",
    type: "date",
    remindBefore: -335,
  };

  // Serviced on 17 October last year: 335 days ago as at 17 September.
  const due = dueSoon([serviced], { serviced: "2025-10-17" }, now);
  assert.equal(due.length, 1);
  assert.equal(due[0].daysAway, -335);

  assert.deepEqual(dueSoon([serviced], { serviced: "2026-01-01" }, now), [], "only months old yet");
});

/*
 * The one that nearly shipped. Before the migration the column does not exist,
 * PostgREST refuses the query, and an error read as "nothing recorded" refuses
 * every booking a groomer tries to make. Same shape as the backup check that
 * passed on an empty bucket.
 */
test("a read that failed blocks nobody", () => {
  assert.deepEqual(blockedBy([vaccination], { values: {}, failed: true }, now), []);

  assert.equal(
    blockedBy([vaccination], { values: {}, failed: false }, now).length,
    1,
    "a read that worked and found nothing still blocks",
  );
});
