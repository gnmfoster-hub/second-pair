import { test } from "node:test";
import assert from "node:assert/strict";
import { platformReport, reportCsv, type ReportRows } from "./platform.ts";
import { rangeFrom } from "./range.ts";

const NOW = Date.parse("2026-09-16T12:00:00Z");
const range = { from: "2026-09-01T00:00:00Z", to: "2026-09-16T00:00:00Z" };

const rows: ReportRows = {
  studios: [
    { id: "lc", name: "Living Canvas", vertical: "tattoo", kind: "customer", account_status: "active", plan_pence: 4900, created_at: "2026-08-20T10:00:00Z", archived_at: null },
    { id: "nt", name: "Neat & Tidy", vertical: "cleaner", kind: "customer", account_status: "trial", plan_pence: 0, created_at: "2026-09-02T10:00:00Z", archived_at: null },
    { id: "demo", name: "Willow", vertical: "salon", kind: "demo", account_status: "trial", plan_pence: 0, created_at: "2026-09-01T10:00:00Z", archived_at: null },
  ],
  conversations: [
    { id: "c1", studio_id: "lc", channel: "email", is_test: false, created_at: "2026-09-05T10:00:00Z", first_response_ms: 4000, status: "booked" },
    { id: "c2", studio_id: "lc", channel: "sms", is_test: false, created_at: "2026-09-06T10:00:00Z", first_response_ms: 8000, status: "needs_human" },
    { id: "c3", studio_id: "lc", channel: "web", is_test: true, created_at: "2026-09-06T10:00:00Z", first_response_ms: 1000, status: "new" },
    { id: "c4", studio_id: "lc", channel: "web", is_test: false, created_at: "2026-08-25T10:00:00Z", first_response_ms: 1000, status: "new" },
  ],
  messages: [
    { conversation_id: "c1", role: "client", created_at: "2026-09-05T10:00:00Z", usage: null, delivery: null },
    { conversation_id: "c1", role: "assistant", created_at: "2026-09-05T10:00:04Z", usage: { cost_micros: 25_000 }, delivery: "sent" },
    { conversation_id: "c2", role: "client", created_at: "2026-09-06T10:00:00Z", usage: null, delivery: null },
    { conversation_id: "c2", role: "assistant", created_at: "2026-09-06T10:00:08Z", usage: { cost_micros: 15_000 }, delivery: "sent" },
    { conversation_id: "c2", role: "assistant", created_at: "2026-09-06T11:00:00Z", usage: null, delivery: "failed" },
    // A test conversation costs nothing in the report.
    { conversation_id: "c3", role: "assistant", created_at: "2026-09-06T10:00:01Z", usage: { cost_micros: 999_999 }, delivery: "sent" },
  ],
  bookings: [
    { studio_id: "lc", created_at: "2026-09-05T11:00:00Z", cancelled_at: null, attended: true, source: "assistant", starts_at: "2026-09-10T10:00:00Z" },
    { studio_id: "lc", created_at: "2026-09-05T11:00:00Z", cancelled_at: null, attended: false, source: "manual", starts_at: "2026-09-11T10:00:00Z" },
    { studio_id: "lc", created_at: "2026-09-05T11:00:00Z", cancelled_at: null, attended: null, source: "block", starts_at: "2026-09-11T10:00:00Z" },
  ],
  payments: [
    { studio_id: "lc", kind: "deposit", status: "paid", gross_pence: 5000, fee_pence: 95, paid_at: "2026-09-05T12:00:00Z" },
    { studio_id: "lc", kind: "payment", status: "paid", gross_pence: 12000, fee_pence: 193, paid_at: "2026-09-10T12:00:00Z" },
    { studio_id: "lc", kind: "payment", status: "pending", gross_pence: 9900, fee_pence: null, paid_at: null },
  ],
  inbound: [
    { studio_id: "lc", verdict: "answered", because: null, at: "2026-09-05T10:00:00Z" },
    { studio_id: "lc", verdict: "ignored", because: "it reads as a sales pitch (a throwaway seller's address)", at: "2026-09-15T10:00:00Z" },
  ],
  reminders: [
    { studio_id: "lc", status: "sent", channel: "sms", created_at: "2026-09-09T10:00:00Z" },
    { studio_id: "lc", status: "failed", channel: "web", created_at: "2026-09-09T10:00:00Z" },
  ],
  forms: [
    { studio_id: "lc", status: "signed", created_at: "2026-09-08T10:00:00Z", signed_at: "2026-09-08T11:00:00Z" },
    { studio_id: "lc", status: "sent", created_at: "2026-09-09T10:00:00Z", signed_at: null },
  ],
  lastSignIn: { lc: "2026-09-15T09:00:00Z", nt: null },
  lastActivity: { lc: "2026-09-15T10:00:00Z", nt: null, demo: "2026-09-16T08:00:00Z" },
};

const report = platformReport(rows, range, NOW);
const lc = report.businesses.find((b) => b.id === "lc")!;

test("enquiries count new conversations in range, not tests", () => {
  assert.equal(lc.enquiries, 2);
  assert.equal(lc.booked, 1);
  assert.equal(lc.conversionPercent, 50);
  assert.equal(lc.handedToPerson, 1);
  assert.equal(lc.medianFirstReplySeconds, 6);
});

test("the assistant's cost is in pence and leaves out test conversations", () => {
  assert.equal(lc.aiCostPence, 4);
});

test("texts count delivered sms replies and sent sms reminders, at an estimated rate", () => {
  assert.equal(lc.textsSent, 2);
  assert.equal(lc.textCostPence, 8);
  assert.equal(lc.failedSends, 1);
  assert.equal(lc.failedReminders, 1);
});

test("money is only what was paid in the range", () => {
  assert.equal(lc.paymentsTaken, 2);
  assert.equal(lc.grossPence, 17000);
  assert.equal(lc.feesPence, 288);
  assert.equal(lc.depositsPence, 5000);
});

test("appointments leave out blocked time; no-shows are counted", () => {
  assert.equal(lc.appointments, 2);
  assert.equal(lc.noShows, 1);
});

test("email verdicts and forms are counted", () => {
  assert.equal(lc.emailAnswered, 1);
  assert.equal(lc.emailIgnored, 1);
  assert.equal(lc.formsSent, 2);
  assert.equal(lc.formsSigned, 1);
});

test("a customer with nothing happening is at risk; the demo never is", () => {
  assert.equal(report.businesses.find((b) => b.id === "nt")!.atRisk, "Nothing has happened yet");
  assert.equal(report.businesses.find((b) => b.id === "demo")!.atRisk, null);
  assert.equal(lc.atRisk, null);
});

test("totals add up and income counts only paying businesses", () => {
  assert.equal(report.totals.enquiries, 2);
  assert.equal(report.totals.planPence, 4900);
  assert.equal(report.totals.grossPence, 17000);
});

test("growth counts customers by the month they started, not the demo", () => {
  assert.deepEqual(report.growth, [
    { month: "2026-08", started: 1, stopped: 0 },
    { month: "2026-09", started: 1, stopped: 0 },
  ]);
});

test("the CSV has a header and one line per business, with commas quoted", () => {
  const csv = reportCsv(report.businesses).split("\n");
  assert.equal(csv.length, 4);
  assert.match(csv[0], /^Business,Trade,Status/);
  assert.match(csv[2], /^Neat & Tidy,cleaner,trial/);
});

test("a typed range includes its last day", () => {
  const r = rangeFrom({ from: "2026-09-01", to: "2026-09-15" });
  assert.equal(r.fromIso, "2026-09-01T00:00:00.000Z");
  assert.equal(r.toIso, "2026-09-16T00:00:00.000Z");
});

test("last month is the whole of last month", () => {
  const r = rangeFrom({ range: "lastmonth" }, new Date("2026-09-16T12:00:00Z"));
  assert.equal(r.fromDay, "2026-08-01");
  assert.equal(r.toDay, "2026-08-31");
});

test("nothing given is the last thirty days", () => {
  const r = rangeFrom({}, new Date("2026-09-16T12:00:00Z"));
  assert.equal(r.key, "30d");
  assert.equal(r.fromDay, "2026-08-18");
});
