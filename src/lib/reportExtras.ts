import { localParts } from "./booking/tz.ts";

/**
 * The parts of a business's report that are about people and money rather
 * than about the assistant: how they paid, who was new, and when it is busy.
 *
 * Pure, so each is tested on rows written out by hand.
 */

const METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  card: "Card machine",
  phone: "Tapped on a phone",
  link: "Payment link",
  other: "Other",
};

export type PaymentRow = {
  kind: string | null;
  method: string | null;
  status: string | null;
  gross_pence: number | null;
  fee_pence: number | null;
  paid_at: string | null;
  created_at: string;
};

export type HowPaid = {
  total: number;
  count: number;
  methods: { method: string; label: string; count: number; pence: number }[];
  deposits: number;
  /** Stripe's fees on what went through Stripe. */
  fees: number;
  /** Links sent in the range and not paid yet. */
  waitingCount: number;
  waitingPence: number;
};

export function howPaid(rows: PaymentRow[], from: Date, to: Date): HowPaid {
  const inRange = (iso: string | null) => Boolean(iso) && Date.parse(iso!) >= from.getTime() && Date.parse(iso!) < to.getTime();
  const paid = rows.filter((r) => r.status === "paid" && inRange(r.paid_at));
  const by = new Map<string, { count: number; pence: number }>();
  for (const p of paid) {
    // A deposit is taken through Stripe by link, whatever the row says.
    const method = p.kind === "deposit" ? "link" : (p.method ?? "other");
    const m = by.get(method) ?? { count: 0, pence: 0 };
    m.count += 1;
    m.pence += p.gross_pence ?? 0;
    by.set(method, m);
  }
  const waiting = rows.filter((r) => r.status === "pending" && inRange(r.created_at));
  return {
    total: paid.reduce((n, p) => n + (p.gross_pence ?? 0), 0),
    count: paid.length,
    methods: [...by.entries()]
      .map(([method, v]) => ({ method, label: METHOD_LABELS[method] ?? method, ...v }))
      .sort((a, b) => b.pence - a.pence),
    deposits: paid.filter((p) => p.kind === "deposit").reduce((n, p) => n + (p.gross_pence ?? 0), 0),
    fees: paid.reduce((n, p) => n + (p.fee_pence ?? 0), 0),
    waitingCount: waiting.length,
    waitingPence: waiting.reduce((n, p) => n + (p.gross_pence ?? 0), 0),
  };
}

export type Visit = { contactId: string; at: string };

/**
 * New faces and regulars in the range.
 *
 * New means their first visit ever falls in the range — not merely their
 * first this month — which needs the history before it, so this takes every
 * visit and is told the range.
 */
export function newAndReturning(visits: Visit[], from: Date, to: Date, now: Date = new Date()) {
  const first = new Map<string, number>();
  for (const v of visits) {
    const t = Date.parse(v.at);
    if (!first.has(v.contactId) || t < first.get(v.contactId)!) first.set(v.contactId, t);
  }
  const came = new Set(
    visits
      .filter((v) => {
        const t = Date.parse(v.at);
        return t >= from.getTime() && t < Math.min(to.getTime(), now.getTime());
      })
      .map((v) => v.contactId),
  );
  let fresh = 0;
  for (const id of came) if ((first.get(id) ?? 0) >= from.getTime()) fresh += 1;
  return { people: came.size, new: fresh, returning: came.size - fresh };
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * When appointments start, by day of the week and by hour, in the business's
 * own time. The quiet hours are the ones worth selling; the busy ones are
 * where another pair of hands would pay for itself.
 */
export function busiest(starts: string[], timezone = "Europe/London") {
  const days = WEEKDAYS.map((label) => ({ label, count: 0 }));
  const hours = new Map<number, number>();
  const hourOf = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", hour12: false });
  for (const iso of starts) {
    const { weekday } = localParts(new Date(iso), timezone);
    const hour = Number(hourOf.format(new Date(iso))) % 24;
    days[(weekday + 6) % 7].count += 1;
    hours.set(hour, (hours.get(hour) ?? 0) + 1);
  }
  const byHour = [...hours.entries()].sort(([a], [b]) => a - b).map(([hour, count]) => ({ hour, count }));
  const top = [...days].sort((a, b) => b.count - a.count)[0];
  const topHour = [...byHour].sort((a, b) => b.count - a.count)[0];
  return { days, byHour, busiestDay: top?.count ? top.label : null, busiestHour: topHour?.hour ?? null };
}
