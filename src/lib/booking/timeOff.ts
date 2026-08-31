import type { BusyPeriod } from "./provider";
import type { TimeOff } from "@/lib/types";
import { zonedToUtc } from "./tz.ts";

/**
 * Turns somebody's regular time off into busy periods.
 *
 * The slot finder already knows how to avoid things that are busy, so the
 * simplest correct answer is to hand it lunch and the school run alongside
 * everything else in the diary rather than teach it a second concept.
 *
 * Expanded per day across the window being searched, in the business's own
 * timezone. "One o'clock" means one o'clock where the business is, in whatever
 * the clocks are doing that week — the same trap the slot finder itself had.
 */
export function timeOffAsBusy(
  timeOff: TimeOff[],
  from: Date,
  to: Date,
  timezone: string,
): BusyPeriod[] {
  if (!timeOff?.length) return [];

  const periods: BusyPeriod[] = [];

  // Start a day early: a window opening mid-afternoon still needs that day's
  // earlier entries excluded, and midnight-relative maths is easier from a
  // whole day back than from an arbitrary instant.
  const cursor = new Date(from);
  cursor.setUTCHours(0, 0, 0, 0);
  cursor.setUTCDate(cursor.getUTCDate() - 1);

  const limit = new Date(to.getTime() + 86400_000);

  while (cursor < limit) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
    }).formatToParts(cursor);
    const at = Object.fromEntries(parts.map((p) => [p.type, p.value]));

    const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
      at.weekday,
    );

    for (const entry of timeOff) {
      if (!entry.days?.includes(weekday)) continue;

      const [fromHour, fromMinute] = entry.from.split(":").map(Number);
      const [toHour, toMinute] = entry.to.split(":").map(Number);
      if (![fromHour, fromMinute, toHour, toMinute].every(Number.isFinite)) continue;

      const starts = zonedToUtc(
        Number(at.year),
        Number(at.month),
        Number(at.day),
        fromHour * 60 + fromMinute,
        timezone,
      );
      const ends = zonedToUtc(
        Number(at.year),
        Number(at.month),
        Number(at.day),
        toHour * 60 + toMinute,
        timezone,
      );

      // A backwards entry is somebody's typo, not an all-day block.
      if (ends <= starts) continue;

      periods.push({
        starts_at: starts.toISOString(),
        ends_at: ends.toISOString(),
      });
    }

    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return periods;
}
