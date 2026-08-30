import type { SupabaseClient } from "@supabase/supabase-js";
import type { OpeningHours, Studio } from "@/lib/types";
import { localParts } from "./booking/tz.ts";

/**
 * The weekly numbers.
 *
 * The one that matters is revenue recovered: money from enquiries that arrived
 * when nobody was there to answer them. Every other figure is context for it —
 * it is the number that answers "what am I paying for", and the only one a
 * business could not have got without this.
 */

export type WeeklyReport = {
  from: string;
  to: string;
  enquiries: number;
  outOfHours: number;
  qualified: number;
  booked: number;
  depositsPaidPence: number;
  quotedValuePence: number;
  /** Booked work that started as an out-of-hours enquiry. */
  recoveredPence: number;
  recoveredBookings: number;
  medianFirstResponseSeconds: number | null;
  needsHuman: number;
  noShows: number;
  aiCostPence: number;
};

/** Whether an instant falls outside the business's own opening hours. */
export function isOutOfHours(
  at: Date,
  hours: OpeningHours[],
  timezone: string,
): boolean {
  const { weekday } = localParts(at, timezone);
  const opening = hours.find((h) => h.day === weekday);
  if (!opening || opening.closed) return true;

  const minutes = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      hour12: false,
    }).format(at),
  ) * 60 +
    Number(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: timezone,
        minute: "2-digit",
      }).format(at),
    );

  const [oh, om] = opening.open.split(":").map(Number);
  const [ch, cm] = opening.close.split(":").map(Number);
  return minutes < oh * 60 + om || minutes >= ch * 60 + cm;
}

const median = (values: number[]): number | null => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
};

export async function weeklyReport(
  db: SupabaseClient,
  studio: Studio,
  from: Date,
  to: Date,
): Promise<WeeklyReport> {
  const { data: conversations } = await db
    .from("conversations")
    .select(
      "id, status, created_at, first_response_ms, " +
        "enquiries(id, quote_low_pence, bookings(id, starts_at, deposit_amount_pence, deposit_status, cancelled_at, attended))",
    )
    .eq("studio_id", studio.id)
    .gte("created_at", from.toISOString())
    .lt("created_at", to.toISOString());

  type Row = {
    id: string;
    status: string;
    created_at: string;
    first_response_ms: number | null;
    enquiries: {
      quote_low_pence: number | null;
      bookings: {
        deposit_amount_pence: number;
        deposit_status: string;
        cancelled_at: string | null;
        attended: boolean | null;
      }[];
    } | null;
  };

  const rows = (conversations ?? []) as unknown as Row[];

  const report: WeeklyReport = {
    from: from.toISOString(),
    to: to.toISOString(),
    enquiries: rows.length,
    outOfHours: 0,
    qualified: 0,
    booked: 0,
    depositsPaidPence: 0,
    quotedValuePence: 0,
    recoveredPence: 0,
    recoveredBookings: 0,
    medianFirstResponseSeconds: null,
    needsHuman: 0,
    noShows: 0,
    aiCostPence: 0,
  };

  const responseTimes: number[] = [];

  for (const row of rows) {
    const afterHours = isOutOfHours(new Date(row.created_at), studio.hours, studio.timezone);
    if (afterHours) report.outOfHours++;
    if (row.status === "needs_human") report.needsHuman++;
    if (row.status !== "new" && row.status !== "lost") report.qualified++;
    if (row.first_response_ms != null) responseTimes.push(row.first_response_ms / 1000);

    const live = (row.enquiries?.bookings ?? []).filter((b) => !b.cancelled_at);
    if (live.length) {
      report.booked++;
      const value = row.enquiries?.quote_low_pence ?? 0;
      report.quotedValuePence += value;

      // The headline: work that would most likely have been lost, because
      // nobody was there when the enquiry came in.
      if (afterHours) {
        report.recoveredBookings++;
        report.recoveredPence += value;
      }
    }

    for (const b of row.enquiries?.bookings ?? []) {
      if (b.deposit_status === "paid") report.depositsPaidPence += b.deposit_amount_pence;
      if (b.attended === false) report.noShows++;
    }
  }

  report.medianFirstResponseSeconds = median(responseTimes);

  // What the assistant cost to run, so the margin is never a mystery.
  const { data: usage } = await db
    .from("messages")
    .select("usage, conversations!inner(studio_id)")
    .eq("conversations.studio_id", studio.id)
    .not("usage", "is", null)
    .gte("created_at", from.toISOString())
    .lt("created_at", to.toISOString());

  const micros = (usage ?? []).reduce(
    (total: number, m: { usage?: { cost_micros?: number } }) =>
      total + (m.usage?.cost_micros ?? 0),
    0,
  );
  report.aiCostPence = Math.round(micros / 10_000);

  return report;
}

/** Monday to Monday, in the business's own timezone. */
export function lastWeek(now = new Date(), timezone = "Europe/London") {
  const { year, month, day, weekday } = localParts(now, timezone);
  const today = new Date(Date.UTC(year, month - 1, day));
  const monday = new Date(today);
  monday.setUTCDate(monday.getUTCDate() - ((weekday + 6) % 7));
  const from = new Date(monday);
  from.setUTCDate(from.getUTCDate() - 7);
  return { from, to: monday };
}
