import { test } from "node:test";
import assert from "node:assert/strict";
import { stampStyle } from "./stamp.ts";

const deg = (s: { "--tilt": string }) => Number(s["--tilt"].replace("deg", ""));
const ink = (s: { "--ink": string }) => Number(s["--ink"]);

test("the same row is always stamped the same way", () => {
  const a = stampStyle("73397d65-a439-4971-b08e-57a26af404ae");
  const b = stampStyle("73397d65-a439-4971-b08e-57a26af404ae");
  assert.deepEqual(a, b);
});

/*
 * The whole effect. If neighbours matched, a column of stamps would be a
 * graphic rather than something somebody pressed.
 */
test("two rows next to each other do not match", () => {
  const ids = Array.from({ length: 40 }, (_, i) => `conversation-${i}`);
  const tilts = ids.map((id) => deg(stampStyle(id)));
  const sameAsNeighbour = tilts.filter((t, i) => i > 0 && t === tilts[i - 1]).length;
  assert.ok(sameAsNeighbour <= 2, `${sameAsNeighbour} of 39 matched the row above`);
  assert.ok(new Set(tilts).size > 10, `only ${new Set(tilts).size} distinct angles in 40 rows`);
});

/*
 * Small enough to read as a hand rather than as broken alignment, and small
 * enough that it cannot change the height of the row it sits in.
 */
test("never far enough off true to look like a fault", () => {
  for (const id of Array.from({ length: 500 }, (_, i) => `x${i}`)) {
    const s = stampStyle(id);
    assert.ok(Math.abs(deg(s)) <= 1.4, `${id} tilted ${deg(s)}`);
    assert.ok(ink(s) >= 0.88 && ink(s) <= 1, `${id} inked ${ink(s)}`);
  }
});

/* Server and browser have to agree, so nothing may depend on where it runs. */
test("it is only arithmetic on the id", () => {
  assert.deepEqual(stampStyle("abc"), stampStyle("abc"));
  assert.notDeepEqual(stampStyle("abc"), stampStyle("abd"));
});
