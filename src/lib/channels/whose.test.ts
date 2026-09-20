import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mayAllocate,
  describe as describeWhose,
  mayHaveTheirOwn,
  whatAllowingMeans,
  type Person,
} from "./whose.ts";

const people: Person[] = [
  { id: "stevie", name: "Stevie", active: true },
  { id: "mark", name: "Mark", active: true },
  { id: "gone", name: "Pete", active: false },
];

test("giving it back to the business is always allowed", () => {
  assert.deepEqual(mayAllocate({ kind: "business" }, people, 1), { ok: true, artistId: null });
});

test("a second line can be given to somebody who works there", () => {
  assert.deepEqual(mayAllocate({ kind: "person", artistId: "stevie" }, people, 2), {
    ok: true,
    artistId: "stevie",
  });
});

/*
 * The one that matters. A business with one number, given to one person, has
 * no way for a new customer to reach the business at all — every text goes to
 * her and nobody else is ever offered.
 */
test("the only line on a channel cannot be given away", () => {
  const no = mayAllocate({ kind: "person", artistId: "stevie" }, people, 1);
  assert.equal(no.ok, false);
  assert.match(no.ok === false ? no.because : "", /only one on this channel/i);
});

test("somebody who has left keeps nothing pointed at them", () => {
  const no = mayAllocate({ kind: "person", artistId: "gone" }, people, 3);
  assert.equal(no.ok, false);
  assert.match(no.ok === false ? no.because : "", /not working here/i);
});

test("a stranger is not on this business", () => {
  const no = mayAllocate({ kind: "person", artistId: "someone-else" }, people, 3);
  assert.equal(no.ok, false);
  assert.match(no.ok === false ? no.because : "", /not on this business/i);
});

/* The difference is behavioural, so it is described behaviourally. */
test("what it says is what actually changes", () => {
  assert.match(describeWhose(null, people), /asks who/i);
  assert.match(describeWhose("stevie", people), /Stevie/);
  assert.match(describeWhose("stevie", people), /never asks/i);
  assert.match(describeWhose("vanished", people), /no longer/i);
});

/*
 * The state nobody could see.
 *
 * A line cannot be given to somebody who has left, so this is only ever reached
 * by a person leaving after the line was already theirs. It is the worst one to
 * be quiet about: every enquiry arriving goes to a diary nobody is filling, and
 * the assistant never asks, because it has been told it already knows.
 *
 * And the owner's screen could not say it at all. It was handed a list of
 * people still working there, so she was not in it, the select found no option
 * with her id and fell back to its first, and the line read as the business's.
 * Pressing Save on that screen would then have made it true.
 */
test("a line belonging to somebody who has left says so, and says what to do", () => {
  const said = describeWhose("gone", people);
  assert.match(said, /Pete/);
  assert.match(said, /not working here/i);
  assert.match(said, /never asks/i);
  assert.match(said, /somebody else|back to the business/i);
});

test("nobody may have their own until an owner says so", () => {
  assert.equal(mayHaveTheirOwn(null, "instagram"), false);
  assert.equal(mayHaveTheirOwn(undefined, "instagram"), false);
  assert.equal(mayHaveTheirOwn([], "instagram"), false);
});

test("and only on the channels they were given", () => {
  assert.equal(mayHaveTheirOwn(["instagram"], "instagram"), true);
  assert.equal(mayHaveTheirOwn(["instagram"], "sms"), false);
  assert.equal(mayHaveTheirOwn(["instagram", "sms"], "sms"), true);
});

/*
 * The sentence both screens use. The owner's page and the person's page
 * describing one switch differently is how somebody ends up believing a stylist
 * has been cut off from the business's number.
 */
test("what allowing it means is said in terms of what changes", () => {
  assert.match(whatAllowingMeans("sms", "Aisha"), /still reaches them/i);
  assert.match(whatAllowingMeans("instagram", "Aisha"), /only they can/i);
  assert.match(whatAllowingMeans("email", "Aisha"), /only them/i);
});
