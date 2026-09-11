import { test } from "node:test";
import assert from "node:assert/strict";
import { readDiaryLayout, diaryLayoutClasses, diaryPanes } from "./diaryLayout.ts";

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

test("the saved choice applies to the day and the week, which both have two shapes", () => {
  for (const view of ["day", "week"] as const) {
    assert.deepEqual(diaryPanes(view, "grid"), { list: "hidden", grid: "block" });
    assert.deepEqual(diaryPanes(view, "list"), { list: "block", grid: "hidden" });
  }
});

/*
 * The month has one shape, so a stored preference for a shape it does not have
 * must not decide anything there.
 *
 * The week used to be in this list, for a real reason: it had no control of
 * its own, so a saved "columns" carried into it handed a phone the
 * seven-across grid with no way back out. What made that a trap was the
 * missing control rather than the week, and the week has one now.
 */
test("the month always follows the width", () => {
  for (const saved of ["grid", "list", null] as const) {
    assert.deepEqual(
      diaryPanes("month", saved),
      { list: "sm:hidden", grid: "hidden sm:block" },
      `month with ${saved} saved should follow the width`,
    );
  }
});

test("with nothing saved, every view still follows the width", () => {
  for (const view of ["day", "week", "month"] as const) {
    assert.deepEqual(diaryPanes(view, null), { list: "sm:hidden", grid: "hidden sm:block" });
  }
});
