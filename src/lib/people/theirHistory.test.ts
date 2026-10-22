import { test } from "node:test";
import assert from "node:assert/strict";
import { theirHistoryNote, type TheirHistory } from "./theirHistory.ts";

const TZ = "Europe/London";

const nobody: TheirHistory = { coming: [], visits: 0, elsewhere: [], metBefore: false };

/*
 * Most people are strangers, and a stranger's prompt must read exactly as it
 * did before this file existed. An empty string is the signal to leave the
 * whole block out.
 */
test("a brand new enquiry adds nothing at all", () => {
  assert.equal(theirHistoryNote(nobody, TZ), "");
});

test("an appointment they already have is stated, with the day and the time", () => {
  const note = theirHistoryNote(
    {
      ...nobody,
      coming: [{ startsAt: "2026-10-31T13:00:00Z", withWhom: "Dave Bone" }],
    },
    TZ,
  );
  assert.match(note, /already has an appointment booked/);
  assert.match(note, /Saturday 31 October at 1pm with Dave Bone/);
  assert.match(note, /do not ask when they would like to come/);
});

test("a deposit still owed on it is said, because it is the thing to mention", () => {
  const note = theirHistoryNote(
    {
      ...nobody,
      coming: [{ startsAt: "2026-10-31T13:00:00Z", depositOwedPence: 2500 }],
    },
    TZ,
  );
  assert.match(note, /deposit of £25 is still owed/);
});

test("two appointments are both listed", () => {
  const note = theirHistoryNote(
    {
      ...nobody,
      coming: [
        { startsAt: "2026-10-31T13:00:00Z" },
        { startsAt: "2026-11-14T09:00:00Z" },
      ],
    },
    TZ,
  );
  assert.match(note, /already has appointments booked/);
  assert.match(note, /31 October/);
  assert.match(note, /14 November/);
});

/*
 * A missed appointment is not a visit. "You were last in on the 3rd" said to
 * somebody who did not come on the 3rd is how a customer is lost, so the
 * reading is done before it gets here and this only has to say it well.
 */
test("a returning customer is greeted as one, with when they were last in", () => {
  const note = theirHistoryNote(
    {
      ...nobody,
      visits: 4,
      lastVisit: { startsAt: "2026-09-12T10:00:00Z" },
    },
    TZ,
  );
  assert.match(note, /been in 4 times before, most recently on 12 September/);
  assert.match(note, /returning customer/);
});

test("once before reads as once, not as 1 times", () => {
  const note = theirHistoryNote({ ...nobody, visits: 1 }, TZ);
  assert.match(note, /been in once before/);
  assert.doesNotMatch(note, /1 times/);
});

/*
 * The whole of Jess's second morning. She had given all of this on the
 * website the day before and was asked for every bit of it again by email.
 */
test("what they said on another channel is carried over, and not asked again", () => {
  const note = theirHistoryNote(
    {
      ...nobody,
      elsewhere: [
        {
          channel: "web",
          at: "2026-10-18T10:41:00Z",
          facts: ["where: lower stomach", "size: palm", "confirmed 18 or over", "2 reference photos already sent in"],
        },
      ],
    },
    TZ,
  );
  assert.match(note, /already told us this, on the website on 18 October/);
  assert.match(note, /2 reference photos already sent in/);
  assert.match(note, /Do not ask for any of that again/);
});

test("a thread with nothing on it is not mentioned", () => {
  const note = theirHistoryNote(
    { ...nobody, elsewhere: [{ channel: "email", at: "2026-10-18T10:41:00Z", facts: [] }] },
    TZ,
  );
  assert.equal(note, "");
});

/* Giles's standing rule, and this text is read by a model, not a customer,
   but it is written in the same voice and the checker reads every file. */
test("no long dashes anywhere in it", () => {
  const note = theirHistoryNote(
    {
      ...nobody,
      visits: 2,
      lastVisit: { startsAt: "2026-09-12T10:00:00Z" },
      coming: [{ startsAt: "2026-10-31T13:00:00Z", withWhom: "Dave", depositOwedPence: 2500 }],
      elsewhere: [{ channel: "sms", at: "2026-10-18T10:41:00Z", facts: ["size: palm"] }],
    },
    TZ,
  );
  assert.doesNotMatch(note, /[—–]/);
});
