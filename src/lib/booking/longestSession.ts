import type { ServiceBand } from "../verticals.ts";

/**
 * How long one appointment may run, for a trade that has not said.
 *
 * Every business starts on six hours, which is a whole working day for a salon
 * and half of one for a plasterer. A job longer than the limit is not refused
 * and nothing anywhere says so: durationFor quietly books it for the limit
 * instead. An eight-hour room goes in the diary as six, the diary shows the
 * plasterer free at three while he is still on the ceiling, the customer has
 * been told a finishing time that was never true, and nobody finds out until
 * the next booking lands on top of it.
 *
 * So it is taken from the trade's own list, because the trade's own list is
 * where the eight-hour room came from.
 *
 * Only the jobs that are booked straight off. A band marked "consult first" is
 * booked as a consultation whatever its length, so an electrician's sixteen-hour
 * rewire says nothing about how long his day is; counting it would give every
 * electrician a sixteen-hour appointment limit on the strength of a job that is
 * never booked as one.
 *
 * Never shorter than the six hours everybody had, so no trade is worse off than
 * it was, and never longer than the day the column allows.
 */
const WAS = 360;
const MOST = 1440;

export function longestSession(bands: Pick<ServiceBand, "duration_minutes" | "hours_low" | "requires_consultation">[]): number {
  const bookable = bands.filter((b) => !b.requires_consultation);

  const minutes = bookable.map((b) =>
    b.duration_minutes != null ? b.duration_minutes : Math.round((b.hours_low ?? 0) * 60),
  );

  return Math.min(MOST, Math.max(WAS, ...minutes, 0));
}
