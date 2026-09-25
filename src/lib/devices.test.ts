import { test } from "node:test";
import assert from "node:assert/strict";
import { howLongAgo, deviceLine, looksDead, nothingSent, nameOf, QUIET_DAYS } from "./devices.ts";

const NOW = new Date("2026-10-01T12:00:00Z");
const ago = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();

const phone = { id: "a", label: "iPhone", addedAt: ago(60), lastUsedAt: ago(1) };

test("how long ago, in words somebody would use", () => {
  assert.equal(howLongAgo(ago(0), NOW), "today");
  assert.equal(howLongAgo(ago(1), NOW), "yesterday");
  assert.equal(howLongAgo(ago(3), NOW), "3 days ago");
  assert.equal(howLongAgo(ago(21), NOW), "3 weeks ago");
  assert.equal(howLongAgo(ago(70), NOW), "2 months ago");
});

test("a clock that disagrees does not produce a negative age", () => {
  const future = new Date(NOW.getTime() + 86_400_000).toISOString();
  assert.equal(howLongAgo(future, NOW), "today");
});

test("the line says when it was added and when it last buzzed", () => {
  assert.equal(deviceLine(phone, NOW), "Added 8 weeks ago · last buzzed yesterday");
});

test("a device that has never buzzed says so without a verdict", () => {
  const line = deviceLine({ ...phone, lastUsedAt: null }, NOW);
  assert.equal(line, "Added 8 weeks ago · not buzzed yet");
  assert.doesNotMatch(line, /stopped|broken|problem|check/i);
});

test("nothing sent at all is a fact about the business, not the device", () => {
  assert.equal(nothingSent([{ ...phone, lastUsedAt: null }]), true);
  assert.equal(nothingSent([phone]), false);
  assert.equal(nothingSent([]), false, "no devices is not the same as none reached");
});

test("a lone quiet device is never called dead", () => {
  const old = { ...phone, lastUsedAt: ago(QUIET_DAYS + 30) };
  assert.equal(
    looksDead(old, [old], NOW),
    false,
    "one phone and a quiet two months is a quiet two months",
  );
});

test("dead means this one stopped while another carried on", () => {
  const stopped = { id: "a", label: "iPhone", addedAt: ago(200), lastUsedAt: ago(QUIET_DAYS + 5) };
  const working = { id: "b", label: "iPad", addedAt: ago(200), lastUsedAt: ago(2) };
  assert.equal(looksDead(stopped, [stopped, working], NOW), true);
  assert.equal(looksDead(working, [stopped, working], NOW), false);
});

test("recently buzzed is never dead, however many others there are", () => {
  const a = { ...phone, lastUsedAt: ago(3) };
  const b = { id: "b", label: "iPad", addedAt: ago(200), lastUsedAt: ago(1) };
  assert.equal(looksDead(a, [a, b], NOW), false);
});

test("a device never reached is not dead, only unused", () => {
  const never = { id: "a", label: "iPhone", addedAt: ago(200), lastUsedAt: null };
  const working = { id: "b", label: "iPad", addedAt: ago(200), lastUsedAt: ago(1) };
  assert.equal(
    looksDead(never, [never, working], NOW),
    false,
    "it may simply have been added and never needed",
  );
});

test("a device with no name still has something to call it", () => {
  assert.equal(nameOf(phone), "iPhone");
  assert.equal(nameOf({ ...phone, label: null }), "A device");
  assert.equal(nameOf({ ...phone, label: "   " }), "A device");
});
