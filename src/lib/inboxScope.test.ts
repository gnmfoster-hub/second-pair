import { test } from "node:test";
import assert from "node:assert/strict";
import { inboxScope } from "./inboxScope.ts";

test("a worker sees their own and nothing else", () => {
  assert.deepEqual(inboxScope({ owns: false, artistId: "nadia" }), {
    kind: "mine",
    artistId: "nadia",
  });
});

test("a worker cannot ask for somebody else's", () => {
  /*
   * The filter is the owner's. Without this, a worker who typed ?whose= into
   * the address bar would read a colleague's enquiries — the one thing being
   * given their own inbox was meant to stop.
   */
  assert.deepEqual(inboxScope({ owns: false, artistId: "nadia", whose: "dave" }), {
    kind: "mine",
    artistId: "nadia",
  });
  assert.deepEqual(inboxScope({ owns: false, artistId: "nadia", whose: "everyone" }), {
    kind: "mine",
    artistId: "nadia",
  });
});

test("the owner sees their own, plus whatever nobody has claimed", () => {
  assert.deepEqual(inboxScope({ owns: true, artistId: "dave" }), {
    kind: "mine_and_unclaimed",
    artistId: "dave",
  });
});

test("the owner can ask for everybody", () => {
  assert.deepEqual(inboxScope({ owns: true, artistId: "dave", whose: "everyone" }), {
    kind: "everyone",
  });
});

test("the owner can ask for one person", () => {
  assert.deepEqual(inboxScope({ owns: true, artistId: "dave", whose: "nadia" }), {
    kind: "somebody",
    artistId: "nadia",
  });
});

// -------------------------------------------- logins without a diary

test("somebody on the desk sees everybody's", () => {
  /*
   * This used to give them only the enquiries nobody had claimed, on the
   * reasoning that hiding everything would leave an empty screen. Half right
   * and the wrong half: a receptionist is on the desk precisely to deal with
   * everybody's, because a stylist with her hands in somebody's hair does not
   * answer the phone. The old rule left the person most able to help looking
   * at the shortest list in the building.
   */
  assert.deepEqual(inboxScope({ owns: false, artistId: null }), { kind: "everyone" });
});

test("and can narrow to one person, the same way an owner can", () => {
  assert.deepEqual(inboxScope({ owns: false, artistId: null, whose: "sarah" }), {
    kind: "somebody",
    artistId: "sarah",
  });
  assert.deepEqual(inboxScope({ owns: false, artistId: null, whose: "everyone" }), {
    kind: "everyone",
  });
});

test("somebody who does have a diary still sees only their own", () => {
  // Unchanged, and the point of the whole rule: a stylist's inbox is hers.
  assert.deepEqual(inboxScope({ owns: false, artistId: "sarah" }), {
    kind: "mine",
    artistId: "sarah",
  });
  // Even if an address bar asks otherwise.
  assert.deepEqual(inboxScope({ owns: false, artistId: "sarah", whose: "everyone" }), {
    kind: "mine",
    artistId: "sarah",
  });
});

test("an owner with no diary of their own still sees the unclaimed", () => {
  assert.deepEqual(inboxScope({ owns: true, artistId: null }), { kind: "unclaimed" });
});

test("an owner with no diary asking for everybody still gets everybody", () => {
  assert.deepEqual(inboxScope({ owns: true, artistId: null, whose: "everyone" }), {
    kind: "everyone",
  });
});
