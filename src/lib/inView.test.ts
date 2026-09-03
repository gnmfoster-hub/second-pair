import { test } from "node:test";
import assert from "node:assert/strict";
import { mostlyInView } from "./inView.ts";

const VIEW = 800;
const at = (top: number, height: number) => ({ top, bottom: top + height, height });

test("something filling the screen is showing", () => {
  assert.equal(mostlyInView(at(100, 480), VIEW), true);
});

test("something below the fold is not", () => {
  assert.equal(mostlyInView(at(2527, 480), VIEW), false);
});

test("something scrolled past above is not", () => {
  assert.equal(mostlyInView(at(-600, 480), VIEW), false);
});

test("exactly half counts, a sliver does not", () => {
  // 240 of 480 showing at the bottom edge.
  assert.equal(mostlyInView(at(VIEW - 240, 480), VIEW), true);
  assert.equal(mostlyInView(at(VIEW - 40, 480), VIEW), false);
});

test("touching the edge is not being on screen", () => {
  assert.equal(mostlyInView(at(VIEW, 480), VIEW), false);
  assert.equal(mostlyInView(at(-480, 480), VIEW), false);
});

// ----------------------------------------- the one that fails on a small phone

test("a panel taller than the screen can still be showing", () => {
  /*
   * The whole reason this is a function. Measured against its own height, a
   * 900px panel in an 800px window can never have half of itself visible — so
   * the demo would wait forever, and only ever on the small screens this was
   * written to fix.
   */
  assert.equal(mostlyInView(at(0, 900), VIEW), true);
  assert.equal(mostlyInView(at(-100, 900), VIEW), true);
});

test("a tall panel only just entering is still not showing", () => {
  assert.equal(mostlyInView(at(VIEW - 100, 900), VIEW), false);
});

test("nothing with no height is ever showing", () => {
  assert.equal(mostlyInView(at(0, 0), VIEW), false);
  assert.equal(mostlyInView(at(0, 480), 0), false);
});

test("a stricter threshold can be asked for", () => {
  assert.equal(mostlyInView(at(VIEW - 240, 480), VIEW, 0.9), false);
  assert.equal(mostlyInView(at(100, 480), VIEW, 0.9), true);
});
