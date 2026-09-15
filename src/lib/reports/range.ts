/**
 * The date range a report is for, from whatever the address says.
 *
 * Named ranges for the common questions — this month against last, the
 * quarter — and exact dates for the rest. "To" is inclusive when a person
 * types it, so the end of the range is the start of the following day.
 */

export const RANGES = [
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "month", label: "This month" },
  { key: "lastmonth", label: "Last month" },
  { key: "quarter", label: "Last 3 months" },
  { key: "year", label: "Last 12 months" },
] as const;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const iso = (d: Date) => d.toISOString().slice(0, 10);

export function rangeFrom(
  params: { from?: string; to?: string; range?: string },
  now: Date = new Date(),
): { key: string; fromDay: string; toDay: string; fromIso: string; toIso: string; label: string } {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  let from: Date;
  let to: Date = today; // inclusive
  let key: string = params.range ?? "";

  if (!key && params.from && DAY.test(params.from)) {
    from = new Date(`${params.from}T00:00:00Z`);
    to = params.to && DAY.test(params.to) ? new Date(`${params.to}T00:00:00Z`) : today;
    if (to < from) [from, to] = [to, from];
    key = "custom";
  } else {
    switch (key) {
      case "7d":
        from = new Date(today.getTime() - 6 * 86_400_000);
        break;
      case "month":
        from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
        break;
      case "lastmonth":
        from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
        to = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0));
        break;
      case "quarter":
        from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 3, today.getUTCDate()));
        break;
      case "year":
        from = new Date(Date.UTC(today.getUTCFullYear() - 1, today.getUTCMonth(), today.getUTCDate()));
        break;
      default:
        key = "30d";
        from = new Date(today.getTime() - 29 * 86_400_000);
    }
  }

  const end = new Date(to.getTime() + 86_400_000);
  const label =
    RANGES.find((r) => r.key === key)?.label ??
    `${from.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })} to ${to.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}`;

  return { key, fromDay: iso(from), toDay: iso(to), fromIso: from.toISOString(), toIso: end.toISOString(), label };
}
