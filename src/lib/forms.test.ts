import { test } from "node:test";
import assert from "node:assert/strict";
import { ticked } from "./forms.ts";

test("a ticked box reads as on", () => {
  const fd = new FormData();
  fd.set("enabled", "on");
  assert.equal(ticked(fd, "enabled"), true);
});

test("an unticked box sends nothing, and reads as off", () => {
  assert.equal(ticked(new FormData(), "enabled"), false);
});

test("a box the browser gave its own value still reads as on", () => {
  const fd = new FormData();
  fd.set("enabled", "yes please");
  assert.equal(ticked(fd, "enabled"), true);
});

test("an empty value is still a tick, because the box was sent", () => {
  const fd = new FormData();
  fd.set("enabled", "");
  assert.equal(ticked(fd, "enabled"), true);
});
