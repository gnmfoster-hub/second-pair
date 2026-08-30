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

export type SlotOptions = {
  hours: OpeningHours[];
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

    const opening = hours.find((h) => h.day === weekday);
    if (!opening || opening.closed) continue;

    const opens = minutesInto(opening.open);
    const closes = minutesInto(opening.close);
    if (closes <= opens) continue;

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
