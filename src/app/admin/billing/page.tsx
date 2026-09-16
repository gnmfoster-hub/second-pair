import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPlatformAdmin } from "@/lib/platform";
import {
  billFor,
  costOfServing,
  marginOf,
  monthOf,
  monthBefore,
  monthName,
  type Used,
} from "@/lib/billing";
import { setPlan, markBilled, recordCost, removeCost, remeter } from "./actions";

export const metadata = { title: "Second Pair — billing" };
export const dynamic = "force-dynamic";

/*
 * Money, with the minus in front of the pound sign rather than after it.
 * "£-4.40" is how a computer writes a loss; "−£4.40" is how anybody reading a
 * set of books writes one.
 */
const pounds = (p: number) => {
  const amount = (Math.abs(p) / 100).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${p < 0 ? "−" : ""}£${amount}`;
};

/**
 * What each business owes this month, what it cost to serve them, and what we
 * paid out — in one place, because a margin is the difference between two
 * numbers that currently live in two different companies' dashboards.
 *
 * Reads the figures written down nightly by the meter rather than counting
 * messages: old conversations are thrown away by data retention, and a bill
 * has to survive that.
 */
export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  if (!(await isPlatformAdmin())) notFound();

  const params = await searchParams;
  const thisMonth = monthOf();
  const month = /^\d{4}-\d{2}-01$/.test(params.month ?? "") ? params.month! : thisMonth;

  const db = createAdminClient();

  const { data: studios } = await db
    .from("studios")
    .select("id, name, kind, archived_at, plan, plan_pence, texts_included, text_overage_pence, account_status")
    .order("name");

  const { data: usage, error: usageError } = await db
    .from("usage_months")
    .select("*")
    .eq("month", month);

  const { data: costs } = await db
    .from("platform_costs")
    .select("*")
    .eq("month", month)
    .order("supplier");

  /*
   * The tables arrive with a migration. Until it is run the page says so in
   * one sentence rather than throwing a database error at somebody.
   */
  if (usageError) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <Link href="/admin" className="hint text-sm hover:text-foreground">
          ← Every business
        </Link>
        <h1 className="page-title mt-2">Billing</h1>
        <div className="card mt-4 p-5">
          <p className="font-medium">The billing tables are not there yet.</p>
          <p className="hint mt-2 text-sm">
            Run <code>supabase/migrations/20260917140000_billing.sql</code> in Supabase → SQL
            editor. Nothing else is needed: the nightly job starts filling them in the same night,
            and this page works the moment they exist.
          </p>
          <p className="hint mt-2 text-sm">It said: {usageError.message}</p>
        </div>
      </div>
    );
  }

  const live = (studios ?? []).filter((s) => s.kind !== "demo" && !s.archived_at);
  const usageOf = new Map((usage ?? []).map((u) => [u.studio_id as string, u]));

  const rows = live.map((studio) => {
    const u = usageOf.get(studio.id);
    const used: Used = {
      textsOut: (u?.texts_out as number) ?? 0,
      textsIn: (u?.texts_in as number) ?? 0,
      emailsOut: (u?.emails_out as number) ?? 0,
      modelMicros: Number(u?.model_micros ?? 0),
    };

    /*
     * Priced as the month was priced, not as the plan stands today. A price
     * that changes in March must not rewrite February's invoice.
     */
    const plan = {
      planPence: (u?.plan_pence as number) ?? studio.plan_pence ?? 0,
      textsIncluded:
        u ? ((u.texts_included as number | null) ?? null) : ((studio.texts_included as number | null) ?? null),
      overagePence: (u?.text_overage_pence as number) ?? studio.text_overage_pence ?? 0,
    };

    const bill = billFor(plan, used);
    const cost = costOfServing(used);

    return {
      studio,
      used,
      plan,
      bill,
      cost,
      margin: marginOf(bill.totalPence, cost),
      billedPence: (u?.billed_pence as number | null) ?? null,
      billedAt: (u?.billed_at as string | null) ?? null,
      metered: Boolean(u),
    };
  });

  const revenue = rows.reduce((t, r) => t + r.bill.totalPence, 0);
  const serving = rows.reduce((t, r) => t + r.cost, 0);
  const suppliers = (costs ?? []).reduce((t, c) => t + (c.pence as number), 0);
  const left = revenue - serving - suppliers;

  const months = [thisMonth, monthBefore(thisMonth), monthBefore(monthBefore(thisMonth))];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <Link href="/admin" className="hint text-sm hover:text-foreground">
        ← Every business
      </Link>

      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="page-title">Billing — {monthName(month)}</h1>
        <form action={remeter}>
          <button className="btn border border-border text-sm">Count it again now</button>
        </form>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {months.map((m) => (
          <Link
            key={m}
            href={`/admin/billing?month=${m}`}
            className={`rounded-full border px-3 py-1 text-xs ${
              m === month ? "border-accent bg-accent text-on-accent" : "border-border hover:border-accent"
            }`}
          >
            {monthName(m)}
            {m === thisMonth ? " (so far)" : ""}
          </Link>
        ))}
      </div>

      {/* ─────────────────────────────────────────────── the month in four figures */}
      <div className="mt-5 grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
        {[
          { label: "To invoice", value: pounds(revenue), hint: `${rows.length} businesses` },
          { label: "Cost of serving them", value: pounds(serving), hint: "model, texts, numbers" },
          { label: "Supplier bills", value: pounds(suppliers), hint: costs?.length ? `${costs.length} recorded` : "none recorded yet" },
          {
            label: "Left",
            value: pounds(left),
            hint: revenue
              ? `${Math.round((left / revenue) * 100)}% of what you take`
              : "nothing invoiced yet",
          },
        ].map((f) => (
          <div key={f.label} className="bg-surface p-4">
            <div className="label">{f.label}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{f.value}</div>
            <div className="hint text-xs">{f.hint}</div>
          </div>
        ))}
      </div>

      {/* ─────────────────────────────────────────────────────── each business */}
      <h2 className="mt-8 text-lg font-semibold">Each business</h2>
      <div className="mt-3 overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[54rem] text-sm">
          <thead className="bg-surface-2">
            <tr className="text-left">
              <th className="px-3 py-2">Business</th>
              <th className="px-3 py-2">Plan</th>
              <th className="px-3 py-2 text-right">Texts sent</th>
              <th className="px-3 py-2 text-right">Extras</th>
              <th className="px-3 py-2 text-right">To invoice</th>
              <th className="px-3 py-2 text-right">Cost</th>
              <th className="px-3 py-2 text-right">Left</th>
              <th className="px-3 py-2">Billed</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const extras = r.bill.lines.find((l) => l.what === "Extra texts");
              return (
                <tr key={r.studio.id} className="border-t border-border">
                  <td className="px-3 py-2">
                    <div className="font-medium">{r.studio.name}</div>
                    {!r.metered && (
                      <div className="hint text-xs">not counted yet — press “Count it again now”</div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div>{r.studio.plan || "—"}</div>
                    <div className="hint text-xs tabular-nums">
                      {pounds(r.plan.planPence)} ·{" "}
                      {r.plan.textsIncluded == null
                        ? "texts included"
                        : `${r.plan.textsIncluded} texts, then ${r.plan.overagePence}p`}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.used.textsOut.toLocaleString()}
                    <div className="hint text-xs">{r.used.textsIn.toLocaleString()} in</div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {extras ? pounds(extras.pence) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums">
                    {pounds(r.bill.totalPence)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{pounds(r.cost)}</td>
                  <td
                    className={`px-3 py-2 text-right font-medium tabular-nums ${
                      r.margin.pence < 0 ? "text-warn" : ""
                    }`}
                  >
                    {pounds(r.margin.pence)}
                    <div className="hint text-xs">{r.margin.percent}%</div>
                  </td>
                  <td className="px-3 py-2">
                    {r.billedAt ? (
                      <span className="text-xs">
                        {pounds(r.billedPence ?? 0)}
                        <br />
                        <span className="hint">
                          {new Date(r.billedAt).toLocaleDateString("en-GB")}
                        </span>
                      </span>
                    ) : (
                      <form action={markBilled} className="flex items-center gap-1">
                        <input type="hidden" name="studio" value={r.studio.id} />
                        <input type="hidden" name="month" value={month} />
                        <input
                          id={`amount-${r.studio.id}`}
                          name="amount"
                          defaultValue={(r.bill.totalPence / 100).toFixed(2)}
                          className="input w-20 py-1 text-right text-xs"
                          aria-label={`What ${r.studio.name} was charged`}
                        />
                        <button className="btn border border-border px-2 py-1 text-xs">Billed</button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ───────────────────────────────────────────────────────── the plans */}
      <h2 className="mt-8 text-lg font-semibold">What each one is on</h2>
      <p className="hint mt-1 text-sm">
        Changing a plan takes effect from the next time the month is counted. Months already
        counted keep the prices they were counted with, so an old invoice cannot be rewritten by
        a new price. Leave the texts box empty for unlimited.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {live.map((studio) => (
          <form key={studio.id} action={setPlan} className="card flex flex-wrap items-end gap-2 p-3">
            <input type="hidden" name="studio" value={studio.id} />
            <div className="w-full font-medium">{studio.name}</div>
            <label className="text-xs">
              <span className="label">Plan</span>
              <input
                id={`plan-${studio.id}`}
                name="plan"
                defaultValue={studio.plan ?? ""}
                placeholder="Standard"
                className="input w-28 py-1 text-sm"
              />
            </label>
            <label className="text-xs">
              <span className="label">£ a month</span>
              <input
                id={`price-${studio.id}`}
                name="plan_price"
                defaultValue={((studio.plan_pence ?? 0) / 100).toFixed(2)}
                className="input w-20 py-1 text-right text-sm"
              />
            </label>
            <label className="text-xs">
              <span className="label">Texts</span>
              <input
                id={`texts-${studio.id}`}
                name="texts_included"
                defaultValue={studio.texts_included ?? ""}
                placeholder="∞"
                className="input w-16 py-1 text-right text-sm"
              />
            </label>
            <label className="text-xs">
              <span className="label">Then p each</span>
              <input
                id={`over-${studio.id}`}
                name="overage"
                defaultValue={studio.text_overage_pence ?? 8}
                className="input w-16 py-1 text-right text-sm"
              />
            </label>
            <button className="btn border border-border px-3 py-1 text-sm">Save</button>
          </form>
        ))}
      </div>

      {/* ──────────────────────────────────────────────────── what we pay out */}
      <h2 className="mt-8 text-lg font-semibold">What you paid out in {monthName(month)}</h2>
      <p className="hint mt-1 text-sm">
        Type these in as the invoices arrive. Until they are here the “Left” figure above is only
        the per-business half.
      </p>

      <div className="mt-3 overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[32rem] text-sm">
          <tbody>
            {(costs ?? []).map((c) => (
              <tr key={c.id as string} className="border-b border-border last:border-0">
                <td className="px-3 py-2 font-medium">{c.supplier as string}</td>
                <td className="px-3 py-2 text-right tabular-nums">{pounds(c.pence as number)}</td>
                <td className="hint px-3 py-2 text-xs">{(c.note as string) ?? ""}</td>
                <td className="px-3 py-2 text-right">
                  <form action={removeCost}>
                    <input type="hidden" name="id" value={c.id as string} />
                    <button className="hint text-xs hover:text-warn">Remove</button>
                  </form>
                </td>
              </tr>
            ))}
            {!costs?.length && (
              <tr>
                <td className="hint px-3 py-3 text-sm" colSpan={4}>
                  Nothing recorded for this month yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <form action={recordCost} className="card mt-3 flex flex-wrap items-end gap-2 p-3">
        <input type="hidden" name="month" value={month} />
        <label className="text-xs">
          <span className="label">Supplier</span>
          <input
            id="c-supplier"
            name="supplier"
            list="suppliers"
            placeholder="Twilio"
            className="input w-36 py-1 text-sm"
            required
          />
          <datalist id="suppliers">
            {["Vercel", "Supabase", "Twilio", "Anthropic", "Resend", "Zoho", "Domain", "Stripe"].map(
              (s) => (
                <option key={s} value={s} />
              ),
            )}
          </datalist>
        </label>
        <label className="text-xs">
          <span className="label">£</span>
          <input id="c-amount" name="amount" className="input w-24 py-1 text-right text-sm" required />
        </label>
        <label className="text-xs grow">
          <span className="label">Note</span>
          <input
            id="c-note"
            name="note"
            placeholder="Pro plan, September"
            className="input w-full py-1 text-sm"
          />
        </label>
        <button className="btn-primary px-3 py-1 text-sm">Record it</button>
      </form>
    </div>
  );
}
