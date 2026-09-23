/**
 * How the whole platform is doing, business by business, over a range.
 *
 * The back office had eight headline figures and a list. That answers "how
 * many customers do I have" and not the questions that decide what to do next:
 * which businesses are going quiet, what each one costs to run against what it
 * pays, whether texts are failing somewhere, which trade is converting.
 *
 * Pure: the page fetches rows for the range and hands them in, and every sum
 * here is tested against rows written out by hand. Money in pence throughout;
 * the assistant's cost arrives in millionths and is turned into pence once.
 */

import { addUpCalls } from "../voice/callCost.ts";
import { countsAsEnquiry } from "../conversationStatus.ts";

export type StudioRow = {
  id: string;
  name: string;
  vertical: string | null;
  kind: string | null;
  account_status: string | null;
  plan_pence: number | null;
  created_at: string;
  archived_at: string | null;
};

export type ReportRows = {
  studios: StudioRow[];
  /**
   * Who works where, so a call can be priced against a name rather than a
   * uuid. Optional: every caller of this predates it and a missing list only
   * costs the per-person breakdown, not the report.
   */
  people?: { id: string; studio_id: string; name: string }[];
  conversations: { id: string; studio_id: string; channel: string; is_test: boolean | null; created_at: string; first_response_ms: number | null; status: string | null }[];
  messages: { conversation_id: string; role: string; created_at: string; usage: { cost_micros?: number } | null; delivery: string | null }[];
  bookings: { studio_id: string; created_at: string; cancelled_at: string | null; attended: boolean | null; source: string | null; starts_at: string }[];
  payments: { studio_id: string; kind: string | null; status: string | null; gross_pence: number | null; fee_pence: number | null; paid_at: string | null }[];
  inbound: { studio_id: string | null; verdict: string; because: string | null; at: string }[];
  reminders: { studio_id: string; status: string; channel: string | null; created_at: string }[];
  forms?: { studio_id: string; status: string; created_at: string; signed_at: string | null }[];
  /** Durations and outcomes only, never words. Absent until the migration. */
  calls?: {
    studio_id: string;
    at: string;
    rang_seconds: number;
    forwarded: boolean;
    answered: boolean;
    recorded_seconds: number;
    transcribed: boolean;
  }[];
  /** Most recent sign-in by anybody in each business. */
  lastSignIn?: Record<string, string | null>;
  /** Most recent thing that happened in each business, over all time. */
  lastActivity?: Record<string, string | null>;
};

export type BusinessReport = {
  id: string;
  name: string;
  trade: string;
  status: string;
  planPence: number;
  enquiries: number;
  booked: number;
  conversionPercent: number | null;
  handedToPerson: number;
  medianFirstReplySeconds: number | null;
  inboundByChannel: Record<string, number>;
  repliesByChannel: Record<string, number>;
  aiCostPence: number;
  textsSent: number;
  textCostPence: number;
  /** Calls taken on this business's number in the window. */
  calls: number;
  /**
   * What they cost us, from published rates rather than an invoice.
   *
   * The telephone is the only channel billed by the minute and by far the
   * dearest per use: ringing an owner's mobile for fifteen seconds bills a
   * whole minute at roughly six times the inbound rate. Shown separately from
   * texts because the decision it informs — whether to sell calls at all, and
   * for how much — is a different decision.
   */
  callCostPence: number;
  /**
   * The telephone, split by whose it was.
   *
   * Giles sells a receptionist per person and has to charge for each instance,
   * so the per-business total is not the number he needs — he needs to know
   * what Aisha's line cost him this month, separately from the shop's.
   *
   * Only people with calls appear. A row of noughts for everybody in the diary
   * is a table nobody reads.
   */
  callsByPerson: { name: string; calls: number; pence: number }[];
  emailAnswered: number;
  emailParked: number;
  emailIgnored: number;
  appointments: number;
  noShows: number;
  paymentsTaken: number;
  grossPence: number;
  feesPence: number;
  depositsPence: number;
  formsSent: number;
  formsSigned: number;
  failedSends: number;
  failedReminders: number;
  lastSignIn: string | null;
  lastActivity: string | null;
  daysQuiet: number | null;
  atRisk: string | null;
};

/** A UK text, roughly. Stated where it is shown, because it is an estimate. */
export const TEXT_PENCE = 4;

const inRange = (iso: string | null | undefined, from: number, to: number) => {
  if (!iso) return false;
  const t = Date.parse(iso);
  return t >= from && t < to;
};

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export function platformReport(
  rows: ReportRows,
  range: { from: string; to: string },
  now: number = Date.now(),
): { businesses: BusinessReport[]; totals: BusinessReport; growth: { month: string; started: number; stopped: number }[] } {
  const from = Date.parse(range.from);
  const to = Date.parse(range.to);

  const convStudio = new Map(rows.conversations.map((c) => [c.id, c]));

  const businesses = rows.studios.map((s): BusinessReport => {
    /*
     * Test conversations were never real and spam was never an enquiry.
     *
     * Both are dropped at the same point and for the same reason: a figure
     * that counts them is a figure somebody will quote. Spam especially — it
     * only ever converts at nought per cent, so leaving it in makes a busy
     * inbox look like a failing one.
     */
    const convs = rows.conversations.filter(
      (c) => c.studio_id === s.id && !c.is_test && countsAsEnquiry(c.status),
    );
    const convIds = new Set(convs.map((c) => c.id));
    const newConvs = convs.filter((c) => inRange(c.created_at, from, to));

    const msgs = rows.messages.filter((m) => convIds.has(m.conversation_id) && inRange(m.created_at, from, to));
    const inboundByChannel: Record<string, number> = {};
    const repliesByChannel: Record<string, number> = {};
    let aiMicros = 0;
    let textsSent = 0;
    let failedSends = 0;
    for (const m of msgs) {
      const channel = convStudio.get(m.conversation_id)?.channel ?? "web";
      if (m.role === "client") inboundByChannel[channel] = (inboundByChannel[channel] ?? 0) + 1;
      if (m.role === "assistant" || m.role === "owner") {
        repliesByChannel[channel] = (repliesByChannel[channel] ?? 0) + 1;
        if (channel === "sms" && m.delivery !== "failed") textsSent += 1;
      }
      if (m.delivery === "failed") failedSends += 1;
      aiMicros += m.usage?.cost_micros ?? 0;
    }

    const calls = (rows.calls ?? []).filter((c) => c.studio_id === s.id && inRange(c.at, from, to));
    const callMoney = addUpCalls(
      calls.map((c) => ({
        rangSeconds: c.rang_seconds ?? 0,
        forwarded: Boolean(c.forwarded),
        recordedSeconds: c.recorded_seconds ?? 0,
        transcribed: Boolean(c.transcribed),
      })),
    );

    const reminders = rows.reminders.filter((r) => r.studio_id === s.id && inRange(r.created_at, from, to));
    textsSent += reminders.filter((r) => r.status === "sent" && r.channel === "sms").length;
    const failedReminders = reminders.filter((r) => r.status === "failed").length;

    const bookings = rows.bookings.filter((b) => b.studio_id === s.id && b.source !== "block");
    const bookedFromEnquiries = bookings.filter((b) => b.source === "assistant" && !b.cancelled_at && inRange(b.created_at, from, to)).length;
    const appointments = bookings.filter((b) => !b.cancelled_at && inRange(b.starts_at, from, to));

    const payments = rows.payments.filter((p) => p.studio_id === s.id && p.status === "paid" && inRange(p.paid_at, from, to));
    const inbound = rows.inbound.filter((i) => i.studio_id === s.id && inRange(i.at, from, to));
    const forms = (rows.forms ?? []).filter((f) => f.studio_id === s.id);

    const enquiries = newConvs.length;
    const lastActivity = rows.lastActivity?.[s.id] ?? null;
    const daysQuiet = lastActivity ? Math.floor((now - Date.parse(lastActivity)) / 86_400_000) : null;

    const live = !s.archived_at && s.kind !== "demo";
    let atRisk: string | null = null;
    if (live) {
      if (s.account_status === "overdue") atRisk = "Payment overdue";
      else if (daysQuiet == null) atRisk = "Nothing has happened yet";
      else if (daysQuiet >= 14) atRisk = `Quiet for ${daysQuiet} days`;
      else if (rows.lastSignIn && !rows.lastSignIn[s.id]) atRisk = "Nobody has signed in";
      else if (rows.lastSignIn?.[s.id] && now - Date.parse(rows.lastSignIn[s.id]!) > 21 * 86_400_000) {
        atRisk = "Nobody has signed in for three weeks";
      }
    }

    return {
      id: s.id,
      name: s.name,
      trade: s.vertical ?? "general",
      status: s.archived_at ? "stopped" : (s.account_status ?? "trial"),
      planPence: s.plan_pence ?? 0,
      enquiries,
      booked: bookedFromEnquiries,
      conversionPercent: enquiries ? Math.round((bookedFromEnquiries / enquiries) * 100) : null,
      handedToPerson: newConvs.filter((c) => c.status === "needs_human").length,
      medianFirstReplySeconds: (() => {
        const m = median(newConvs.map((c) => c.first_response_ms).filter((v): v is number => typeof v === "number"));
        return m == null ? null : Math.round(m / 1000);
      })(),
      inboundByChannel,
      repliesByChannel,
      aiCostPence: Math.round(aiMicros / 10_000),
      textsSent,
      textCostPence: textsSent * TEXT_PENCE,
      calls: callMoney.calls,
      callCostPence: Math.round(callMoney.pence),
      /*
       * Whose line it was, from what the call recorded at the time rather
       * than from whose number it is now — a number that changes hands must
       * not rewrite last month's bill.
       */
      callsByPerson: (() => {
        const mine = new Map<string, { calls: number; pence: number }>();
        for (const c of calls) {
          const id = (c as { artist_id?: string | null }).artist_id;
          if (!id) continue;
          /* The same shape the business total uses, one call at a time. */
          const one = addUpCalls([
            {
              rangSeconds: c.rang_seconds ?? 0,
              forwarded: Boolean(c.forwarded),
              recordedSeconds: c.recorded_seconds ?? 0,
              transcribed: Boolean(c.transcribed),
            },
          ]);
          const got = mine.get(id) ?? { calls: 0, pence: 0 };
          mine.set(id, { calls: got.calls + one.calls, pence: got.pence + one.pence });
        }
        return [...mine.entries()]
          .map(([id, v]) => ({
            name: (rows.people ?? []).find((p) => p.id === id)?.name ?? "somebody who has left",
            calls: v.calls,
            pence: Math.round(v.pence),
          }))
          .sort((a, b) => b.pence - a.pence);
      })(),
      emailAnswered: inbound.filter((i) => i.verdict === "answered").length,
      emailParked: inbound.filter((i) => i.verdict === "parked").length,
      emailIgnored: inbound.filter((i) => i.verdict === "ignored").length,
      appointments: appointments.length,
      noShows: appointments.filter((b) => b.attended === false).length,
      paymentsTaken: payments.length,
      grossPence: payments.reduce((n, p) => n + (p.gross_pence ?? 0), 0),
      feesPence: payments.reduce((n, p) => n + (p.fee_pence ?? 0), 0),
      depositsPence: payments.filter((p) => p.kind === "deposit").reduce((n, p) => n + (p.gross_pence ?? 0), 0),
      formsSent: forms.filter((f) => inRange(f.created_at, from, to)).length,
      formsSigned: forms.filter((f) => inRange(f.signed_at, from, to) && (f.status === "signed" || f.status === "paper")).length,
      failedSends,
      failedReminders,
      lastSignIn: rows.lastSignIn?.[s.id] ?? null,
      lastActivity,
      daysQuiet,
      atRisk,
    };
  });

  const sumBy = (key: keyof BusinessReport) =>
    businesses.reduce((n, b) => n + (typeof b[key] === "number" ? (b[key] as number) : 0), 0);
  const mergeChannels = (key: "inboundByChannel" | "repliesByChannel") =>
    businesses.reduce<Record<string, number>>((acc, b) => {
      for (const [k, v] of Object.entries(b[key])) acc[k] = (acc[k] ?? 0) + v;
      return acc;
    }, {});

  const totalEnquiries = sumBy("enquiries");
  const totalBooked = sumBy("booked");
  const totals: BusinessReport = {
    id: "total",
    name: "All businesses",
    trade: "",
    status: "",
    planPence: businesses.filter((b) => b.status === "active" || b.status === "overdue").reduce((n, b) => n + b.planPence, 0),
    enquiries: totalEnquiries,
    booked: totalBooked,
    conversionPercent: totalEnquiries ? Math.round((totalBooked / totalEnquiries) * 100) : null,
    handedToPerson: sumBy("handedToPerson"),
    medianFirstReplySeconds: median(businesses.map((b) => b.medianFirstReplySeconds).filter((v): v is number => v != null)),
    inboundByChannel: mergeChannels("inboundByChannel"),
    repliesByChannel: mergeChannels("repliesByChannel"),
    aiCostPence: sumBy("aiCostPence"),
    textsSent: sumBy("textsSent"),
    calls: sumBy("calls"),
    callCostPence: sumBy("callCostPence"),
    /*
     * Everybody with a line of their own, across every business, dearest
     * first. This is the row Giles prices a receptionist from.
     */
    callsByPerson: (() => {
      const all = new Map<string, { calls: number; pence: number }>();
      for (const b of businesses) {
        for (const p of b.callsByPerson) {
          const got = all.get(p.name) ?? { calls: 0, pence: 0 };
          all.set(p.name, { calls: got.calls + p.calls, pence: got.pence + p.pence });
        }
      }
      return [...all.entries()]
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.pence - a.pence);
    })(),
    textCostPence: sumBy("textCostPence"),
    emailAnswered: sumBy("emailAnswered"),
    emailParked: sumBy("emailParked"),
    emailIgnored: sumBy("emailIgnored"),
    appointments: sumBy("appointments"),
    noShows: sumBy("noShows"),
    paymentsTaken: sumBy("paymentsTaken"),
    grossPence: sumBy("grossPence"),
    feesPence: sumBy("feesPence"),
    depositsPence: sumBy("depositsPence"),
    formsSent: sumBy("formsSent"),
    formsSigned: sumBy("formsSigned"),
    failedSends: sumBy("failedSends"),
    failedReminders: sumBy("failedReminders"),
    lastSignIn: null,
    lastActivity: null,
    daysQuiet: null,
    atRisk: null,
  };

  // Businesses started and stopped by month, over all time rather than the range.
  const months = new Map<string, { started: number; stopped: number }>();
  const bump = (iso: string | null, key: "started" | "stopped") => {
    if (!iso) return;
    const m = iso.slice(0, 7);
    const row = months.get(m) ?? { started: 0, stopped: 0 };
    row[key] += 1;
    months.set(m, row);
  };
  for (const s of rows.studios.filter((x) => x.kind !== "demo")) {
    bump(s.created_at, "started");
    bump(s.archived_at, "stopped");
  }
  const growth = [...months.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([month, v]) => ({ month, ...v }));

  return { businesses, totals, growth };
}

/** The per-business table as CSV, for a spreadsheet. */
export function reportCsv(businesses: BusinessReport[]): string {
  const pounds = (p: number) => (p / 100).toFixed(2);
  const head = [
    "Business", "Trade", "Status", "Plan £/month", "Enquiries", "Booked by assistant", "Conversion %",
    "Handed to a person", "Median first reply (s)", "Messages in", "Replies out", "Assistant cost £",
    "Texts sent", "Text cost £ (est.)", "Emails answered", "Emails parked", "Emails ignored",
    "Appointments", "No-shows", "Payments", "Taken £", "Stripe fees £", "Deposits £",
    "Forms sent", "Forms signed", "Failed sends", "Failed reminders", "Last sign-in", "Days quiet", "At risk",
  ];
  const cell = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const total = (r: Record<string, number>) => Object.values(r).reduce((n, v) => n + v, 0);
  const lines = businesses.map((b) =>
    [
      b.name, b.trade, b.status, pounds(b.planPence), b.enquiries, b.booked, b.conversionPercent ?? "",
      b.handedToPerson, b.medianFirstReplySeconds ?? "", total(b.inboundByChannel), total(b.repliesByChannel),
      pounds(b.aiCostPence), b.textsSent, pounds(b.textCostPence), b.emailAnswered, b.emailParked, b.emailIgnored,
      b.appointments, b.noShows, b.paymentsTaken, pounds(b.grossPence), pounds(b.feesPence), pounds(b.depositsPence),
      b.formsSent, b.formsSigned, b.failedSends, b.failedReminders, b.lastSignIn?.slice(0, 10) ?? "", b.daysQuiet ?? "", b.atRisk ?? "",
    ].map(cell).join(","),
  );
  return [head.map(cell).join(","), ...lines].join("\n");
}
