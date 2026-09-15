import { test } from "node:test";
import assert from "node:assert/strict";
import { howPaid, newAndReturning, busiest } from "./reportExtras.ts";
import { reportRange } from "./reportRange.ts";

const from = new Date("2026-09-01T00:00:00Z");
const to = new Date("2026-10-01T00:00:00Z");

test("how it was paid: by method, deposits as links, fees, and links still waiting", () => {
  const r = howPaid(
    [
      { kind: "payment", method: "cash", status: "paid", gross_pence: 4000, fee_pence: null, paid_at: "2026-09-10T10:00:00Z", created_at: "2026-09-10T10:00:00Z" },
      { kind: "payment", method: "link", status: "paid", gross_pence: 5500, fee_pence: 193, paid_at: "2026-09-11T10:00:00Z", created_at: "2026-09-11T09:00:00Z" },
      { kind: "deposit", method: null, status: "paid", gross_pence: 2500, fee_pence: 60, paid_at: "2026-09-12T10:00:00Z", created_at: "2026-09-12T10:00:00Z" },
      { kind: "payment", method: "link", status: "pending", gross_pence: 12000, fee_pence: null, paid_at: null, created_at: "2026-09-15T10:00:00Z" },
      { kind: "payment", method: "cash", status: "paid", gross_pence: 999, fee_pence: null, paid_at: "2026-08-31T23:00:00Z", created_at: "2026-08-31T23:00:00Z" },
    ],
    from,
    to,
  );
  assert.equal(r.total, 12000);
  assert.equal(r.count, 3);
  assert.deepEqual(r.methods.map((m) => [m.label, m.pence]), [["Payment link", 8000], ["Cash", 4000]]);
  assert.equal(r.deposits, 2500);
  assert.equal(r.fees, 253);
  assert.equal(r.waitingCount, 1);
  assert.equal(r.waitingPence, 12000);
});

test("new means their first visit ever was in the range", () => {
  const r = newAndReturning(
    [
      { contactId: "jo", at: "2026-06-01T10:00:00Z" },
      { contactId: "jo", at: "2026-09-05T10:00:00Z" },
      { contactId: "sam", at: "2026-09-06T10:00:00Z" },
      { contactId: "sam", at: "2026-09-20T10:00:00Z" },
      { contactId: "ada", at: "2026-10-05T10:00:00Z" },
    ],
    from,
    to,
    new Date("2026-09-30T12:00:00Z"),
  );
  assert.deepEqual(r, { people: 2, new: 1, returning: 1 });
});

test("busiest counts by weekday and hour in the business's own time", () => {
  const r = busiest(["2026-09-12T09:00:00Z", "2026-09-12T13:00:00Z", "2026-09-19T09:30:00Z", "2026-09-14T09:00:00Z"], "Europe/London");
  assert.equal(r.busiestDay, "Sat");
  assert.equal(r.days.find((d) => d.label === "Mon")!.count, 1);
  // 09:00 UTC in September is 10am in London.
  assert.equal(r.busiestHour, 10);
});

test("the report range: last week by default, months and typed dates", () => {
  const now = new Date("2026-09-16T12:00:00Z"); // a Wednesday
  const lastWeek = reportRange({}, now);
  assert.equal(lastWeek.from.toISOString().slice(0, 10), "2026-09-07");
  assert.equal(lastWeek.to.toISOString().slice(0, 10), "2026-09-14");
  assert.equal(reportRange({ range: "week" }, now).from.toISOString().slice(0, 10), "2026-09-14");
  const lastMonth = reportRange({ range: "lastmonth" }, now);
  assert.equal(lastMonth.title, "August 2026");
  assert.equal(lastMonth.to.toISOString().slice(0, 10), "2026-09-01");
  const typed = reportRange({ from: "2026-09-01", to: "2026-09-10" }, now);
  assert.equal(typed.to.toISOString().slice(0, 10), "2026-09-11");
  assert.equal(reportRange({ weeks: "2" }, now).from.toISOString().slice(0, 10), "2026-08-24");
});
