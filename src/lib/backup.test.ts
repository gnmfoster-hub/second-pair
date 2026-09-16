import { test } from "node:test";
import assert from "node:assert/strict";
import { backupName, whichToDelete, seal, unseal } from "./backup.ts";

test("one file a day, named so they sort by date", () => {
  assert.equal(backupName(new Date("2026-09-17T02:11:00Z")), "second-pair-2026-09-17.enc");
  const names = [
    backupName(new Date("2026-09-09T02:00:00Z")),
    backupName(new Date("2026-09-17T02:00:00Z")),
    backupName(new Date("2026-08-31T02:00:00Z")),
  ].sort();
  assert.deepEqual(names, [
    "second-pair-2026-08-31.enc",
    "second-pair-2026-09-09.enc",
    "second-pair-2026-09-17.enc",
  ]);
});

test("the oldest go once there are more than we keep", () => {
  const names = Array.from({ length: 17 }, (_, i) =>
    backupName(new Date(Date.UTC(2026, 8, i + 1))),
  );
  const going = whichToDelete(names, 14);
  assert.equal(going.length, 3);
  assert.deepEqual(going, [
    "second-pair-2026-09-01.enc",
    "second-pair-2026-09-02.enc",
    "second-pair-2026-09-03.enc",
  ]);
});

test("nothing is deleted while there are few enough", () => {
  const names = ["second-pair-2026-09-01.enc", "second-pair-2026-09-02.enc"];
  assert.deepEqual(whichToDelete(names, 14), []);
});

/*
 * This deletes things, so it has to be incapable of deleting something it did
 * not write. A file somebody put in the bucket by hand stays there.
 */
test("anything that is not one of ours is left alone", () => {
  const names = ["notes.txt", "second-pair-2026-09-01.enc", "holiday photos.zip", "backup.sql"];
  assert.deepEqual(whichToDelete(names, 0), ["second-pair-2026-09-01.enc"]);
});

test("what is sealed comes back, and only with the passphrase", () => {
  const secret = "every client's name and number";
  const sealed = seal(Buffer.from(secret, "utf8"), "a passphrase of some length");

  assert.notEqual(sealed.toString("utf8"), secret, "it is not sitting there in the clear");
  assert.equal(unseal(sealed, "a passphrase of some length").toString("utf8"), secret);

  assert.throws(() => unseal(sealed, "the wrong passphrase entirely"));
});

test("a tampered file is refused rather than half-read", () => {
  const sealed = seal(Buffer.from("the book", "utf8"), "a passphrase of some length");
  const meddled = Buffer.from(sealed);
  meddled[meddled.length - 1] ^= 0xff;
  assert.throws(() => unseal(meddled, "a passphrase of some length"));
});

test("two copies of the same thing do not look alike", () => {
  const a = seal(Buffer.from("the book", "utf8"), "a passphrase of some length");
  const b = seal(Buffer.from("the book", "utf8"), "a passphrase of some length");
  assert.notEqual(a.toString("base64"), b.toString("base64"));
});
