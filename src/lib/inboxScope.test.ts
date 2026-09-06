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

test("a manager with no diary gets the unclaimed rather than nothing", () => {
  /*
   * Somebody who answers the phone but does no bookable work. Hiding
   * everything would leave them an empty screen and no way to help.
   */
  assert.deepEqual(inboxScope({ owns: false, artistId: null }), { kind: "unclaimed" });
});

test("an owner with no diary of their own still sees the unclaimed", () => {
  assert.deepEqual(inboxScope({ owns: true, artistId: null }), { kind: "unclaimed" });
});

test("an owner with no diary asking for everybody still gets everybody", () => {
  assert.deepEqual(inboxScope({ owns: true, artistId: null, whose: "everyone" }), {
    kind: "everyone",
  });
});
