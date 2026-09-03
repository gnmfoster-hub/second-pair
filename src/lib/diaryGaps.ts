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
