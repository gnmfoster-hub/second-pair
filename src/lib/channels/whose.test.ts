import { test } from "node:test";
import assert from "node:assert/strict";
import { mayAllocate, describe as describeWhose, type Person } from "./whose.ts";

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
