/**
 * List or grid, and who decides when nobody has.
 *
 * The diary has always had both shapes. The grid puts a column per person and
 * lets an appointment be dragged from one to another, which is how somebody
 * gets moved to a different stylist; the list is an agenda, which is what a
 * phone wants when the question is "what am I doing next".
 *
 * Until now the two were chosen by screen width alone — `sm:hidden` on one and
 * `hidden sm:block` on the other — so a phone could never reach the grid at
 * all. That is fine as a default and wrong as a rule: moving a client to
 * another person is a thing that happens at the desk with a phone in your
 * hand, not only in front of a laptop.
 *
 * So: the width still decides when nobody has said otherwise, and a choice
 * beats it.
 */
export type DiaryLayout = "list" | "grid";

/**
 * Kept in a cookie, not the URL.
 *
 * Twenty-five links in five files point back at the diary — arrows, the week
 * strip, every day in the month grid, each person in the picker. A parameter
 * would have to be threaded through all of them, and the one that got missed
 * would silently drop somebody back to the list mid-task. This file already
 * carries a comment about exactly that going wrong with the view parameter.
 *
 * It is also the honest description: which shape you prefer is a preference,
 * like the colour setting beside it, not a place you have navigated to.
 */
export const DIARY_LAYOUT_COOKIE = "diary_layout";

/** Anything that is not one of the two shapes means "let the width decide". */
export function readDiaryLayout(value: string | undefined | null): DiaryLayout | null {
  return value === "list" || value === "grid" ? value : null;
}

/**
 * The classes that put each shape on screen.
 *
 * Returned together because they are one decision and must not drift apart:
 * every combination has to show exactly one of the two, and a pair of
 * separately written ternaries is how you end up with both or neither.
 */
export function diaryLayoutClasses(layout: DiaryLayout | null): {
  list: string;
  grid: string;
} {
  if (layout === "list") return { list: "block", grid: "hidden" };
  if (layout === "grid") return { list: "hidden", grid: "block" };
  return { list: "sm:hidden", grid: "hidden sm:block" };
}
