import type { BusyPeriod, Slot } from "./provider";
import type { OpeningHours } from "@/lib/types";
import { localParts, zonedToUtc } from "./tz.ts";

/**
 * Turning a diary into offerable times.
 *
 * Rules that matter more than the arithmetic:
 *  - opening hours are wall-clock times in the business's own timezone, never
 *    the server's
 *  - never offer outside opening hours, even when the diary looks free
 *  - never offer a slot overlapping something already booked
 *  - never offer anything inside the notice period
 */

const SLOT_STEP_MINUTES = 30;

/** One evening somebody has said they will work, on one date. */
export type ExtraHours = { date: string; open: string; close: string };

export type SlotOptions = {
  hours: OpeningHours[];
  /**
   * One-off hours for particular dates, widening those days for this person.
   *
   * Everything else here repeats weekly, so without these there is no way to
   * say "I will stay late on Thursday" — and out of hours is exactly when the
   * assistant is the one answering.
   */
  extraHours?: ExtraHours[];
  busy: BusyPeriod[];
  /** How long the appointment needs. */
  durationMinutes: number;
  /** The business's timezone, e.g. Europe/London. */
  timezone: string;
  /** Earliest a booking may be taken, in hours from now. */
  noticeHours?: number;
  /** How far ahead to look. */
  daysAhead?: number;
  /** Cap on what is returned — a wall of times is worse than three good ones. */
  limit?: number;
  /** Injected so this is testable without waiting for tomorrow. */
  now?: Date;
};

const minutesInto = (time: string): number => {
  const [h, m] = time.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

export function findSlots(options: SlotOptions): Slot[] {
  const {
    hours,
    extraHours,
    busy,
    durationMinutes,
    timezone,
    noticeHours = 24,
    daysAhead = 21,
    limit = 6,
    now = new Date(),
  } = options;

  if (durationMinutes <= 0) return [];

  const earliest = now.getTime() + noticeHours * 3600_000;

  const busyRanges = busy
    .map((b) => ({ start: Date.parse(b.starts_at), end: Date.parse(b.ends_at) }))
    .filter((b) => Number.isFinite(b.start) && Number.isFinite(b.end));

  const slots: Slot[] = [];

  for (let dayOffset = 0; dayOffset <= daysAhead && slots.length < limit; dayOffset++) {
    // Step a day at a time from now, then ask what date that is where the
    // business is — which is not necessarily the date where the server is.
    const cursor = new Date(now.getTime() + dayOffset * 86400_000);
    const { year, month, day, weekday } = localParts(cursor, timezone);

    /*
     * The day's window, and anything somebody has said about this one day.
     *
     * Everything else here is a weekly pattern — the business's hours, a
     * person's own, their regular time off — so there was no way to say "I
     * will stay until nine on Thursday". That is the most ordinary thing a
     * small business does, and out of hours is precisely when the assistant is
     * the one answering, so the gap turned late customers away on the owner's
     * behalf.
     *
     * An extra period widens the day rather than replacing it: somebody
     * working late still works their normal hours first. A person who is
     * normally closed that day gets the extra period on its own, which is how
     * "I'll come in on my day off for this one" works.
     */
    const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const extra = (extraHours ?? []).find((e) => e.date === date);

    const opening = hours.find((h) => h.day === weekday);
    const normallyOpen = Boolean(opening && !opening.closed);
    if (!normallyOpen && !extra) continue;

    const windows: { opens: number; closes: number }[] = [];
    if (normallyOpen && opening) {
      windows.push({ opens: minutesInto(opening.open), closes: minutesInto(opening.close) });
    }
    if (extra) {
      windows.push({ opens: minutesInto(extra.open), closes: minutesInto(extra.close) });
    }

    /*
     * Merged, so an evening that runs on from the working day is one stretch
     * rather than two. Without this, a nine-to-five widened to nine has a seam
     * at five o'clock and the slot stepping restarts there — which quietly
     * loses any appointment long enough to straddle it.
     */
    const merged = windows
      .filter((w) => w.closes > w.opens)
      .sort((a, b) => a.opens - b.opens)
      .reduce<{ opens: number; closes: number }[]>((into, w) => {
        const last = into[into.length - 1];
        if (last && w.opens <= last.closes) last.closes = Math.max(last.closes, w.closes);
        else into.push({ ...w });
        return into;
      }, []);

    if (!merged.length) continue;

    for (const window of merged) {
      const opens = window.opens;
      const closes = window.closes;

    // The last start that still finishes before closing.
    const lastStart = closes - durationMinutes;

    for (
      let minute = opens;
      minute <= lastStart && slots.length < limit;
      minute += SLOT_STEP_MINUTES
    ) {
      const start = zonedToUtc(year, month, day, minute, timezone);
      const startMs = start.getTime();
      const endMs = startMs + durationMinutes * 60_000;

      if (startMs < earliest) continue;

      const clashes = busyRanges.some((b) => startMs < b.end && endMs > b.start);
      if (clashes) continue;

      slots.push({
        starts_at: start.toISOString(),
        ends_at: new Date(endMs).toISOString(),
      });
      }
    }
  }

  return slots;
}

/** "Tuesday 2 September, 2:30pm" — how a person would say it. */
export function describeSlot(slot: Slot, timezone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: timezone,
  }).format(new Date(slot.starts_at));
}
