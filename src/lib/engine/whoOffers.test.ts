import { test } from "node:test";
import assert from "node:assert/strict";
import { whoOffers, NOBODY } from "./whoOffers.ts";

const TEAM = [
  { id: "sarah", active: true },
  { id: "jade", active: true },
  { id: "aisha", active: true },
  { id: "gone", active: false },
];

const SERVICES = ["cut", "balayage", "gel"];

test("a service nobody has been excluded from is left out of the map", () => {
  const map = whoOffers(SERVICES, [], TEAM);
  assert.deepEqual(map, {});
});

/*
 * The point of leaving it out. The assistant's rule is "nobody named means
 * everybody", so an absent entry is how a business that has never thought
 * about this keeps working exactly as it did.
 */
test("one exception names everybody else, and only for that service", () => {
  const map = whoOffers(SERVICES, [{ service_id: "balayage", artist_id: "jade" }], TEAM);
  assert.deepEqual(Object.keys(map), ["balayage"]);
  assert.deepEqual(map.balayage, ["sarah", "aisha"]);
});

test("somebody who has left is not offered, exception or no exception", () => {
  const map = whoOffers(SERVICES, [{ service_id: "cut", artist_id: "jade" }], TEAM);
  assert.ok(!map.cut.includes("gone"), "an inactive person must not be offered");
  assert.deepEqual(map.cut, ["sarah", "aisha"]);
});

test("several people off the same thing", () => {
  const map = whoOffers(
    SERVICES,
    [
      { service_id: "balayage", artist_id: "jade" },
      { service_id: "balayage", artist_id: "aisha" },
    ],
    TEAM,
  );
  assert.deepEqual(map.balayage, ["sarah"]);
});

/*
 * The case that has to be said out loud rather than left to fall out of the
 * arithmetic. An empty list reads as "nobody named", which means everybody —
 * so the assistant would offer the first name on the roster for work nobody in
 * the building does.
 */
test("everybody excluded is nobody, not everybody", () => {
  const map = whoOffers(
    ["gel"],
    TEAM.filter((a) => a.active).map((a) => ({ service_id: "gel", artist_id: a.id })),
    TEAM,
  );
  assert.deepEqual(map.gel, [NOBODY]);
  assert.notDeepEqual(map.gel, []);
});

/*
 * A stale row for something taken off the price list must not produce an entry
 * against an id the assistant will never ask about — and must never make a
 * service it does ask about look restricted.
 */
test("an exception against something not on the list is ignored", () => {
  const map = whoOffers(SERVICES, [{ service_id: "retired", artist_id: "jade" }], TEAM);
  assert.deepEqual(map, {});
});

test("a person with no active flag at all counts as working", () => {
  const map = whoOffers(["cut"], [{ service_id: "cut", artist_id: "x" }], [
    { id: "sarah" },
    { id: "x" },
  ]);
  assert.deepEqual(map.cut, ["sarah"]);
});
