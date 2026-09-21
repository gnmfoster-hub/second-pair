import { test } from "node:test";
import assert from "node:assert/strict";
import { isFirstReply } from "./firstReply.ts";

const said = (...roles: string[]) => roles.map((role) => ({ role }));

test("a brand new conversation is the assistant's first reply", () => {
  assert.equal(isFirstReply(said("client")), true);
  assert.equal(isFirstReply([]), true);
});

test("once it has answered them, it has introduced itself", () => {
  assert.equal(isFirstReply(said("client", "assistant", "client")), false);
});

/*
 * The one this was written for.
 *
 * A regular booked over the counter has no conversation. The evening before,
 * the reminder goes out, recorded with the assistant's name on it. She texts
 * back "can we make it half four", and the answer to that was the first thing
 * the assistant had ever said to her — with no line saying what it is, because
 * the old rule saw the reminder and decided it had already introduced itself.
 */
test("a reminder is not an introduction", () => {
  assert.equal(isFirstReply(said("assistant", "client")), true);
});

/* Nor is anything else the business sent before they said a word. */
test("a review ask, a nudge and a note from the owner are not introductions", () => {
  assert.equal(isFirstReply(said("owner", "client")), true);
  assert.equal(isFirstReply(said("system", "client")), true);
  assert.equal(isFirstReply(said("assistant", "owner", "client")), true);
});

/*
 * And it is not re-introduced for ever after. Somebody who booked through the
 * assistant in March and writes again in June has met it.
 */
test("a thread that has been a conversation stays introduced", () => {
  assert.equal(
    isFirstReply(said("client", "assistant", "owner", "assistant", "client")),
    false,
  );
});

/* A reminder after a real conversation changes nothing. */
test("a reminder on a thread it has already answered is still not the first", () => {
  assert.equal(isFirstReply(said("client", "assistant", "assistant", "client")), false);
});
