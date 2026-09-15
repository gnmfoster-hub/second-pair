import { localParts } from "./booking/tz.ts";

/**
 * Which stretch of time a business's report covers.
 *
 * It only ever did a week, which answers "how was last week" and nothing an
 * accountant, a slow month or a year-end asks. The week stays the default,
 * with its arrows; a month, last month, the quarter, the year and any two
 * dates sit beside it.
 *
 * Days are counted in the business's own calendar, the same way the weekly
 * figures always have been: midnight to midnight on their dates.
 */

export const REPORT_RANGES = [
  { key: "week", label: "This week" },
  { key: "lastweek", label: "Last week" },
  { key: "month", label: "This month" },
  { key: "lastmonth", label: "Last month" },
  { key: "quarter", label: "Last 3 months" },
  { key: "year", label: "Last 12 months" },
] as const;

export type ReportRange = {
  key: string;
  from: Date;
  /** Exclusive. */
  to: Date;
  /** "This week so far", "August", "1 Jul – 30 Sep". */
  title: string;
  /** Weeks back, where this is a week you can step through with arrows. */
  weeks: number | null;
  /** Whether the range runs up to now rather than to a finished day. */
  soFar: boolean;
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;
const short = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

export function reportRange(
  params: { range?: string; from?: string; to?: string; weeks?: string },
  now: Date = new Date(),
  timezone = "Europe/London",
): ReportRange {
  const { year, month, day, weekday } = localParts(now, timezone);
  const today = new Date(Date.UTC(year, month - 1, day));
  const monday = new Date(today.getTime() - ((weekday + 6) % 7) * DAY_MS);

  // Two dates typed in.
  if (params.from && DAY.test(params.from)) {
    let from = new Date(`${params.from}T00:00:00Z`);
    let last = params.to && DAY.test(params.to) ? new Date(`${params.to}T00:00:00Z`) : today;
    if (last < from) [from, last] = [last, from];
    return {
      key: "custom",
      from,
      to: new Date(last.getTime() + DAY_MS),
      title: `${short(from)} – ${short(last)}`,
      weeks: null,
      soFar: false,
    };
  }

  switch (params.range) {
    case "month":
      return {
        key: "month",
        from: new Date(Date.UTC(year, month - 1, 1)),
        to: now,
        title: `${today.toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" })} so far`,
        weeks: null,
        soFar: true,
      };
    case "lastmonth": {
      const from = new Date(Date.UTC(year, month - 2, 1));
      return {
        key: "lastmonth",
        from,
        to: new Date(Date.UTC(year, month - 1, 1)),
        title: from.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }),
        weeks: null,
        soFar: false,
      };
    }
    case "quarter": {
      const from = new Date(Date.UTC(year, month - 4, day));
      return { key: "quarter", from, to: now, title: `The last 3 months`, weeks: null, soFar: true };
    }
    case "year": {
      const from = new Date(Date.UTC(year - 1, month - 1, day));
      return { key: "year", from, to: now, title: `The last 12 months`, weeks: null, soFar: true };
    }
  }

  // A week, stepped through with the arrows. -1 is this week; 0 the last whole one.
  const back = params.range === "week" ? -1 : Math.min(52, Math.max(-1, Number(params.weeks) || 0));
  if (back === -1) {
    return { key: "week", from: monday, to: now, title: "This week so far", weeks: -1, soFar: true };
  }
  const from = new Date(monday.getTime() - (back + 1) * 7 * DAY_MS);
  const to = new Date(from.getTime() + 7 * DAY_MS);
  return {
    key: back === 0 ? "lastweek" : "weeks",
    from,
    to,
    title: back === 0 ? "Last week" : `${short(from)} – ${short(new Date(to.getTime() - DAY_MS))}`,
    weeks: back,
    soFar: false,
  };
}
