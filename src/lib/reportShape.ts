/**
 * The parts of a week that only some trades have.
 *
 * The report was written looking at a salon: takings by service, who came
 * back, when the chairs are busy. All of that is right for a business people
 * come to, and it is not the whole of what a business that drives to people
 * wants to know — the first question an electrician or a cleaner asks about
 * their week is where the work was, and the second is whether the jobs took
 * as long as they said.
 *
 * Pure, so both can be tested without a database, and so the report page
 * stays a page rather than a calculator.
 */

export type Job = {
  /** Where it was, as typed. Only mobile trades have one. */
  postcode?: string | null;
  /** What it came to, in pence. */
  pence?: number | null;
  /** How long it was booked for, in minutes. */
  booked?: number | null;
  /** How long it actually took, where somebody said. */
  actual?: number | null;
};

export type Area = { area: string; jobs: number; pence: number };

/**
 * The outward code, which is the part that means a place.
 *
 * "BS7 9QT" and "bs7 9qt" and "BS79QT" are the same street to everybody
 * except a string comparison. Anything that is not recognisably a UK postcode
 * is left out rather than guessed at: a report with "Around the corner" in it
 * as an area is worse than one that admits it does not know.
 */
export function areaOf(postcode: string | null | undefined): string | null {
  const tidy = String(postcode ?? "").toUpperCase().replace(/\s+/g, "");
  const match = /^([A-Z]{1,2}\d[A-Z\d]?)\d[A-Z]{2}$/.exec(tidy);
  if (match) return match[1];
  // Somebody typing only the outward code — common when it is a rough area.
  const outward = /^([A-Z]{1,2}\d[A-Z\d]?)$/.exec(tidy);
  return outward ? outward[1] : null;
}

/**
 * Where the week's work was, biggest first.
 *
 * By what it earned rather than by how many, because six small jobs in one
 * town and one big one in another is a fact about where to advertise, and
 * counting alone hides it.
 */
export function whereTheWorkIs(jobs: Job[], limit = 6): { areas: Area[]; unknown: number } {
  const byArea = new Map<string, Area>();
  let unknown = 0;

  for (const job of jobs) {
    const area = areaOf(job.postcode);
    if (!area) {
      unknown++;
      continue;
    }
    const already = byArea.get(area) ?? { area, jobs: 0, pence: 0 };
    already.jobs++;
    already.pence += job.pence ?? 0;
    byArea.set(area, already);
  }

  const areas = [...byArea.values()].sort(
    (a, b) => b.pence - a.pence || b.jobs - a.jobs || a.area.localeCompare(b.area),
  );

  return { areas: areas.slice(0, limit), unknown };
}

export type Running = {
  /** How many jobs somebody recorded a real length for. */
  measured: number;
  over: number;
  under: number;
  onTime: number;
  /** The usual drift, in minutes. Positive means jobs run over. */
  typicalMinutes: number;
};

/**
 * Whether the day runs to time.
 *
 * Closing an appointment can record how long it really took, and nothing has
 * ever read it back. For a trade quoting by the hour that is the number that
 * decides whether the price is right: half an hour over on every job, five
 * days a week, is a day's work a month given away.
 *
 * The middle drift rather than the average, because one disaster of a job
 * should not make a steady week look terrible.
 */
export function howJobsRan(jobs: Job[], slack = 5): Running {
  const drifts: number[] = [];
  for (const job of jobs) {
    if (job.actual == null || job.booked == null || job.booked <= 0) continue;
    drifts.push(job.actual - job.booked);
  }

  if (!drifts.length) {
    return { measured: 0, over: 0, under: 0, onTime: 0, typicalMinutes: 0 };
  }

  const sorted = [...drifts].sort((a, b) => a - b);
  const middle =
    sorted.length % 2
      ? sorted[(sorted.length - 1) / 2]
      : Math.round((sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2);

  return {
    measured: drifts.length,
    over: drifts.filter((d) => d > slack).length,
    under: drifts.filter((d) => d < -slack).length,
    onTime: drifts.filter((d) => Math.abs(d) <= slack).length,
    typicalMinutes: middle,
  };
}
