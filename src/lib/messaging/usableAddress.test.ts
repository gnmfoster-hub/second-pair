import { test } from "node:test";
import assert from "node:assert/strict";
import { usableAddress } from "./address.ts";

/**
 * The one that got through, and everything shaped like it.
 *
 * A business typed info@neatandtidysolutions.co,uk into a settings box — a
 * comma where a full stop belonged, invisible unless you are looking for it —
 * and it went straight to the mail API as the reply-to on every message. The
 * provider refused all of them, so nobody could be answered at all, and the
 * only trace was a webhook response nobody reads.
 */

test("the comma that stopped a business being able to answer anybody", () => {
  assert.equal(usableAddress("info@neatandtidysolutions.co,uk"), null);
});

test("the same address, typed correctly", () => {
  assert.equal(
    usableAddress("info@neatandtidysolutions.co.uk"),
    "info@neatandtidysolutions.co.uk",
  );
});

/*
 * Anything that separates addresses is the dangerous class: one address
 * silently becomes two, and what the header then means is anybody's guess.
 */
test("separators are refused, every one of them", () => {
  for (const bad of [
    "a@b.com, c@d.com",
    "a@b.com;c@d.com",
    "a@b,com",
    "a@b.com c@d.com",
  ]) {
    assert.equal(usableAddress(bad), null, `${bad} should not be usable`);
  }
});

test("a name wrapped round one is unwrapped, not refused", () => {
  assert.equal(usableAddress("Karen Foster <karen@example.co.uk>"), "karen@example.co.uk");
});

test("it is normalised, so the same address saved twice is the same string", () => {
  assert.equal(usableAddress("  Info@Example.CO.UK  "), "info@example.co.uk");
});

test("nothing at all is nothing, not an error", () => {
  assert.equal(usableAddress(null), null);
  assert.equal(usableAddress(undefined), null);
  assert.equal(usableAddress(""), null);
  assert.equal(usableAddress("   "), null);
});

test("the obviously broken shapes", () => {
  for (const bad of [
    "notanemail",
    "@example.com",
    "user@",
    "user@localhost",
    "user@com",
    'user"quoted"@example.com',
    "user@exam ple.com",
  ]) {
    assert.equal(usableAddress(bad), null, `${bad} should not be usable`);
  }
});

/*
 * Real addresses people actually have. A validator that rejects these is worse
 * than none: it stops somebody entering their own correct address and there is
 * nothing they can do about it.
 */
test("ordinary addresses are left alone", () => {
  for (const good of [
    "jo@gmail.com",
    "jo.marsh@example.co.uk",
    "jo+bookings@example.com",
    "jo_marsh@example.org",
    "jo-marsh@sub.example.com",
    "info@livingcanvastattoo.ink",
    "j@x.io",
  ]) {
    assert.equal(usableAddress(good), good, `${good} should be usable`);
  }
});
