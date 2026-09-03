import type { OpeningHours } from "./types";

/**
 * Where the day is free.
 *
 * Every calendar ever made shows what is booked. The question an owner asks
 * twenty times a day — mid-job, with somebody on the phone saying "can you fit
 * me in?" — is the opposite one, and the only way to answer it was to measure
 * white space against the hour lines by eye.
 *
 * The assistant already works this out to offer times to customers. It was
 * strange that the person whose day it is could not see the same thing.
 *
 * Pure arithmetic on pixel offsets, so it is tested directly rather than by
 * squinting at a screenshot — which matters, because being wrong here means
 * telling somebody they are free when they are not.
 */

export type Span = { top: number; height: number };
export type Gap = { top: number; height: number; minutes: number };

/**
 * Gaps worth mentioning, in the order they happen.
 *
 * Nothing outside opening hours: time the business is shut is not a gap it can
 * sell, and labelling it would be noise on every row of every closed evening.
 */
export function gapsFor(
  laid: Span[],
  opening: OpeningHours | undefined,
  hourHeight: number,
  /** Below this it is not an appointment anybody could sell. */
  leastMinutes = 45,
): Gap[] {
  if (!opening || opening.closed) return [];

  const at = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return ((h * 60 + m) / 60) * hourHeight;
  };

  const dayStart = at(opening.open);
  const dayEnd = at(opening.close);
  // Hours that do not parse, or run backwards, describe no day at all.
  if (dayStart == null || dayEnd == null || dayEnd <= dayStart) return [];

  /*
   * Merged first, because two people side by side are not two gaps.
   *
   * Without this, a column with overlapping appointments produces a "gap"
   * between them that does not exist — which is the one mistake this must
   * never make.
   */
  const busy = laid
    .filter((s) => s.height > 0)
    .map((s) => ({ from: s.top, to: s.top + s.height }))
    .sort((a, b) => a.from - b.from)
    .reduce<{ from: number; to: number }[]>((merged, span) => {
      const last = merged[merged.length - 1];
      if (last && span.from <= last.to) last.to = Math.max(last.to, span.to);
      else merged.push({ ...span });
      return merged;
    }, []);

  const gaps: Gap[] = [];
  let cursor = dayStart;

  for (const span of [...busy, { from: dayEnd, to: dayEnd }]) {
    if (span.from > cursor) {
      const height = Math.min(span.from, dayEnd) - cursor;
      const minutes = Math.round((height / hourHeight) * 60);
      // Forty pixels as well as forty-five minutes: on a squeezed row the
      // label would not fit, and plain white space already reads as nothing.
      if (height >= 40 && minutes >= leastMinutes) gaps.push({ top: cursor, height, minutes });
    }
    cursor = Math.max(cursor, span.to);
    if (cursor >= dayEnd) break;
  }

  return gaps;
}

/** "2h 15m", the way somebody would say it out loud. */
export function saidAloud(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h ${rest}m`;
}

export type Segment = { from: number; to: number; busy: boolean };

/**
 * The shape of a day, as proportions of the working hours.
 *
 * "6% full" is a true number that answers nothing. The question somebody has
 * when they glance at this is not how full the day is, it is what shape it is:
 * solid all morning and empty after two is a completely different day from four
 * appointments scattered through it, and the percentage is identical.
 *
 * Percentages of the open period rather than of the clock, because a business
 * open ten till six does not care that it is empty at four in the morning.
 *
 * Returns alternating free and busy runs covering the whole day, so it can be
 * laid out as a row of proportional blocks without any arithmetic at the other
 * end.
 */
export function dayShape(
  laid: Span[],
  opening: OpeningHours | undefined,
  hourHeight: number,
): Segment[] {
  if (!opening || opening.closed) return [];

  const at = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return ((h * 60 + m) / 60) * hourHeight;
  };

  const start = at(opening.open);
  const end = at(opening.close);
  if (start == null || end == null || end <= start) return [];

  const span = end - start;

  // Merged and clipped to opening hours: an appointment that overruns closing
  // is still only as much of the day as the day has.
  const busy = laid
    .filter((s) => s.height > 0)
    .map((s) => ({ from: Math.max(start, s.top), to: Math.min(end, s.top + s.height) }))
    .filter((s) => s.to > s.from)
    .sort((a, b) => a.from - b.from)
    .reduce<{ from: number; to: number }[]>((merged, s) => {
      const last = merged[merged.length - 1];
      if (last && s.from <= last.to) last.to = Math.max(last.to, s.to);
      else merged.push({ ...s });
      return merged;
    }, []);

  const pc = (px: number) => ((px - start) / span) * 100;
  const segments: Segment[] = [];
  let cursor = start;

  for (const block of busy) {
    if (block.from > cursor) segments.push({ from: pc(cursor), to: pc(block.from), busy: false });
    segments.push({ from: pc(block.from), to: pc(block.to), busy: true });
    cursor = block.to;
  }
  if (cursor < end) segments.push({ from: pc(cursor), to: 100, busy: false });

  return segments;
}

/**
 * Local wall-clock minutes since midnight, in the business's own timezone.
 *
 * Everything that positions anything in a diary needs this, and it must be the
 * same everywhere: the grid drawing a card at ten o'clock and the bar saying
 * the morning is busy have to agree about when ten o'clock is.
 */
export function minutesInDay(iso: string, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const at = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return (Number(at.hour) % 24) * 60 + Number(at.minute);
}

/** How long a business is open that day, in minutes. Zero when it is shut. */
function openMinutes(opening: OpeningHours | undefined): number {
  if (!opening || opening.closed) return 0;
  const at = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
  };
  const from = at(opening.open);
  const to = at(opening.close);
  if (from == null || to == null || to <= from) return 0;
  return to - from;
}

/** The calendar date an instant falls on, in the business's own timezone. */
export function dayIn(iso: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const at = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${at.year}-${at.month}-${at.day}`;
}

export type DayColumn = {
  iso: string;
  /** Empty when the business is shut, so a closed day draws as nothing. */
  shape: Segment[];
  busyPercent: number;
};

/**
 * Each day of the week, shaped separately.
 *
 * A week could be averaged into one strip, and it was — "34% full" across
 * seven days, which is true and answers nothing anybody asks. The question at
 * a week's range is never how full the week is, it is *which day has room*:
 * Monday solid and Thursday empty is a completely different week from five
 * half-full days, and both are 50%.
 *
 * Seven shapes side by side answer that in one glance, and they answer it in
 * the same visual language as the day view rather than in a second one.
 *
 * Each day is measured against its own opening hours. A salon open late on
 * Thursday and half day on Saturday has two different denominators, and using
 * one for the week would make the short day look busy and the long one look
 * empty.
 */
export function weekShape(
  entries: { startsAt: string; endsAt: string }[],
  days: string[],
  hours: OpeningHours[],
  timezone: string,
  /** How many people are working, so a salon's day is not read as one van's. */
  people = 1,
): DayColumn[] {
  const byDay = new Map<string, Span[]>();
  for (const e of entries) {
    const key = dayIn(e.startsAt, timezone);
    const minutes = (Date.parse(e.endsAt) - Date.parse(e.startsAt)) / 60_000;
    if (!Number.isFinite(minutes) || minutes <= 0) continue;
    const span = { top: minutesInDay(e.startsAt, timezone), height: minutes };
    byDay.set(key, [...(byDay.get(key) ?? []), span]);
  }

  return days.map((iso) => {
    // Parsed as parts rather than as a Date, so a date string cannot be shifted
    // into the day before by the machine's own timezone.
    const [y, m, d] = iso.split("-").map(Number);
    const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    const opening = hours.find((h) => h.day === weekday);
    const laid = byDay.get(iso) ?? [];

    const shape = dayShape(laid, opening, 60);

    /*
     * The percentage is counted from the raw appointments, not from the shape.
     *
     * The shape merges people who overlap, which is what it is for — the strip
     * says when *anybody* is working, and two stylists booked ten till twelve
     * is one busy stretch on the page, not two. Measuring the merged strip
     * would then report that salon as a quarter full when both chairs were
     * going, because the second person had been merged out of existence.
     *
     * So the strip is merged and the figure is not. They answer different
     * questions and they are allowed to disagree.
     */
    const open = openMinutes(opening);
    const worked = laid.reduce((sum, s) => sum + s.height, 0);
    const room = open * Math.max(1, people);

    return {
      iso,
      shape,
      busyPercent: room > 0 ? Math.min(100, Math.round((worked / room) * 100)) : 0,
    };
  });
}
