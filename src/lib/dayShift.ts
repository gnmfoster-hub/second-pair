import { dayIn } from "./diaryGaps.ts";

/**
 * How many of the business's own days one booking has moved by.
 *
 * ── The mistake this exists because of ──────────────────────────────────────
 *
 * Giles asked for an option to update the future events of a repeating booking.
 * The first version carried the time forward and deliberately left every later
 * DATE alone, on the reasoning that each occurrence has its own day and that is
 * the point of a set.
 *
 * True of a run of scattered picked days. Wrong about the case he described, and
 * which I had quoted in my own commit message as the motivating example: moving
 * a standing Tuesday visit to Wednesday. It changed the time and left twelve
 * Tuesdays exactly where they were. He tried it and said so: "it says saved but
 * it didn't change the days of the future ones."
 *
 * So the rest of a run shifts by however far this one moved, keeping its spacing.
 *
 * ── Why it is not a subtraction of milliseconds ─────────────────────────────
 *
 * Because a day is not always 86,400,000 milliseconds where the business is. The
 * clocks go back on the last Sunday of October and that day has twenty-five hours
 * in it, so a one-day move across it divides to 1.04 and a seven-day move to
 * 7.04. Rounding rescues the small ones and nothing rescues a run that crosses
 * two changes.
 *
 * Counted on the calendar instead: which day it was on, which day it is on now,
 * and the difference between those two dates at noon - noon because it is the
 * furthest any zone's midnight shifts, so the subtraction can never land on the
 * wrong side of a date.
 */
export function dayShift(wasAt: string, nowAt: string, timezone: string): number {
  const from = dayIn(wasAt, timezone);
  const to = dayIn(nowAt, timezone);
  if (from === to) return 0;
  return Math.round(
    (Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000,
  );
}

/**
 * The same day of the business's calendar, shifted, as YYYY-MM-DD.
 *
 * Kept beside the count because the two have to agree about what a day is. The
 * caller then puts the time of day back on in the business's own zone, which is
 * what stops a run drifting by an hour across a clock change.
 */
export function shiftDay(iso: string, by: number, timezone: string): string {
  const its = dayIn(iso, timezone);
  return new Date(Date.parse(`${its}T12:00:00Z`) + by * 86_400_000)
    .toISOString()
    .slice(0, 10);
}
