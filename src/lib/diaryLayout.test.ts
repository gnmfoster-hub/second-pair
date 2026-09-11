import { test } from "node:test";
import assert from "node:assert/strict";
import { readDiaryLayout, diaryLayoutClasses } from "./diaryLayout.ts";

test("readDiaryLayout takes the two shapes and nothing else", () => {
  assert.equal(readDiaryLayout("list"), "list");
  assert.equal(readDiaryLayout("grid"), "grid");
  assert.equal(readDiaryLayout(undefined), null);
  assert.equal(readDiaryLayout(null), null);
  assert.equal(readDiaryLayout(""), null);
  assert.equal(readDiaryLayout("GRID"), null);
  assert.equal(readDiaryLayout("month"), null);
});

test("with no choice, the width decides — as it did before", () => {
  const { list, grid } = diaryLayoutClasses(null);
  assert.equal(list, "sm:hidden");
  assert.equal(grid, "hidden sm:block");
});

test("a choice shows that shape at every width", () => {
  assert.deepEqual(diaryLayoutClasses("list"), { list: "block", grid: "hidden" });
  assert.deepEqual(diaryLayoutClasses("grid"), { list: "hidden", grid: "block" });
});

/*
 * The failure that matters: a phone showing the list and the grid at once, or
 * a desktop showing neither. Both shapes render on every page, and only these
 * classes keep exactly one of them visible.
 */
test("exactly one shape is ever shown", () => {
  for (const choice of [null, "list", "grid"] as const) {
    const { list, grid } = diaryLayoutClasses(choice);
    const hiddenEverywhere = (c: string) => c === "hidden";
    const shownEverywhere = (c: string) => c === "block";
    if (choice === null) {
      // Complementary at the breakpoint rather than absolute.
      assert.equal(list, "sm:hidden");
      assert.equal(grid, "hidden sm:block");
    } else {
      assert.ok(
        (shownEverywhere(list) && hiddenEverywhere(grid)) ||
          (hiddenEverywhere(list) && shownEverywhere(grid)),
        `both or neither shown for ${choice}`,
      );
    }
  }
});
