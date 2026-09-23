import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPlatformAdmin } from "@/lib/platform";
import { VERTICAL_LIST, verticalPack } from "@/lib/verticals";
import { platformReport, TEXT_PENCE, type BusinessReport } from "@/lib/reports/platform";
import { loadPlatformRows } from "@/lib/reports/loadPlatform";
import { rangeFrom, RANGES } from "@/lib/reports/range";
import { whyTheyWereTreatedThatWay, keptOut } from "@/lib/reports/whyEmail";

export const metadata = { title: "Second Pair reports" };
export const dynamic = "force-dynamic";

/**
 * Reports across every business, for a range you choose.
 *
 * Built to answer the questions the console's headline figures could not:
 * who is going quiet, what each business costs to run against what it pays,
 * where messages are failing, and which trades are working. Everything on
 * the page downloads as a spreadsheet.
 */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; range?: string; trade?: string; business?: string; test?: string }>;
}) {
  if (!(await isPlatformAdmin())) notFound();
  const params = await searchParams;
  const range = rangeFrom(params);

  const db = createAdminClient();
  const rows = await loadPlatformRows(db, { from: range.fromIso, to: range.toIso });
  const report = platformReport(rows, { from: range.fromIso, to: range.toIso });

  const showDemos = params.test === "1";
  const businesses = report.businesses.filter(
    (b) =>
      (showDemos || rows.studios.find((s) => s.id === b.id)?.kind !== "demo") &&
      (!params.trade || b.trade === params.trade) &&
      (!params.business || b.id === params.business),
  );
  const totals = platformReport(
    { ...rows, studios: rows.studios.filter((s) => businesses.some((b) => b.id === s.id)) },
    { from: range.fromIso, to: range.toIso },
  ).totals;

  const atRisk = businesses.filter((b) => b.atRisk);
  const unhealthy = businesses.filter((b) => b.failedSends || b.failedReminders);
  const channels = [...new Set([...Object.keys(totals.inboundByChannel), ...Object.keys(totals.repliesByChannel)])].sort();
  const byTrade = [...new Set(businesses.map((b) => b.trade))].map((trade) => {
    const of = businesses.filter((b) => b.trade === trade);
    const enquiries = of.reduce((n, b) => n + b.enquiries, 0);
    const booked = of.reduce((n, b) => n + b.booked, 0);
    return {
      trade,
      label: verticalPack(trade).label,
      businesses: of.length,
      enquiries,
      booked,
      conversion: enquiries ? Math.round((booked / enquiries) * 100) : null,
      gross: of.reduce((n, b) => n + b.grossPence, 0),
    };
  });

  const qs = new URLSearchParams({
    from: range.fromDay,
    to: range.toDay,
    ...(params.trade ? { trade: params.trade } : {}),
    ...(params.business ? { business: params.business } : {}),
    ...(showDemos ? { test: "1" } : {}),
  }).toString();

  /*
   * What the intake decided, for the businesses on screen. Grouped, because a
   * fortnight of spam is two hundred lines that say the same six things.
   */
  const onScreen = new Set(businesses.map((b) => b.id));
  const arrivals = (rows.inbound ?? []).filter(
    (row) => !row.studio_id || onScreen.has(row.studio_id as string),
  );
  const reasons = whyTheyWereTreatedThatWay(arrivals);
  const kept = keptOut(arrivals);

  const pounds = (p: number) => `£${(p / 100).toLocaleString("en-GB", { minimumFractionDigits: p % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
  const costPence = totals.aiCostPence + totals.textCostPence;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <Link href="/admin" className="hint text-sm hover:text-foreground">
        ← Every business
      </Link>
      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="page-title">Reports</h1>
        <a href={`/admin/reports/export?${qs}`} className="btn border border-border text-sm">
          Download as a spreadsheet
        </a>
      </div>

      {/* ─────────────────────────── the range and filters, as a plain GET form */}
      <form className="card mt-4 flex flex-wrap items-end gap-3 p-4" method="get">
        <div className="flex flex-wrap gap-1.5">
          {RANGES.map((r) => (
            <Link
              key={r.key}
              href={`/admin/reports?range=${r.key}${params.trade ? `&trade=${params.trade}` : ""}`}
              className={`rounded-full border px-3 py-1 text-xs ${range.key === r.key ? "border-accent bg-accent text-on-accent" : "border-border hover:border-accent"}`}
            >
              {r.label}
            </Link>
          ))}
        </div>
        <label className="text-sm">
          <span className="label">From</span>
          <input id="r-from" type="date" name="from" defaultValue={range.fromDay} className="input py-1.5" />
        </label>
        <label className="text-sm">
          <span className="label">To</span>
          <input id="r-to" type="date" name="to" defaultValue={range.toDay} className="input py-1.5" />
        </label>
        <label className="text-sm">
          <span className="label">Trade</span>
          <select id="r-trade" name="trade" defaultValue={params.trade ?? ""} className="input py-1.5">
            <option value="">All trades</option>
            {VERTICAL_LIST.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="label">Business</span>
          <select id="r-business" name="business" defaultValue={params.business ?? ""} className="input py-1.5">
            <option value="">All businesses</option>
            {rows.studios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input id="r-test" type="checkbox" name="test" value="1" defaultChecked={showDemos} />
          Include demo
        </label>
        <button className="btn bg-accent text-sm text-on-accent">Show</button>
      </form>

      <p className="hint mt-2 text-xs">
        {range.label}. Figures are for what happened in that range; income is the monthly plans of paying businesses today.
      </p>

      {/* ─────────────────────────────────────────── the headline */}
      <section className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Monthly income" value={pounds(totals.planPence)} note={`${businesses.filter((b) => b.status === "active").length} paying`} />
        <Tile
          label="Enquiries"
          value={String(totals.enquiries)}
          note={totals.conversionPercent == null ? "none yet" : `${totals.booked} booked · ${totals.conversionPercent}%`}
        />
        <Tile label="Taken through Stripe" value={pounds(totals.grossPence)} note={`${totals.paymentsTaken} payments · ${pounds(totals.feesPence)} fees`} />
        <Tile
          label="Cost to run"
          value={pounds(costPence)}
          note={`assistant ${pounds(totals.aiCostPence)} · texts ~${pounds(totals.textCostPence)}`}
        />
      </section>

      {/* ─────────────────────────────────────────── what needs attention */}
      <section className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="card p-5">
          <h2 className="section-title">At risk</h2>
          {atRisk.length ? (
            <ul className="mt-3 divide-y divide-border text-sm">
              {atRisk.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0 truncate font-medium">{b.name}</span>
                  <span className="pill shrink-0 bg-warn/10 text-xs text-warn">{b.atRisk}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="hint mt-2 text-sm">Nobody is going quiet.</p>
          )}
        </div>
        <div className="card p-5">
          <h2 className="section-title">Health</h2>
          {unhealthy.length ? (
            <ul className="mt-3 divide-y divide-border text-sm">
              {unhealthy.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0 truncate font-medium">{b.name}</span>
                  <span className="hint shrink-0 text-xs">
                    {b.failedSends ? `${b.failedSends} messages failed` : ""}
                    {b.failedSends && b.failedReminders ? " · " : ""}
                    {b.failedReminders ? `${b.failedReminders} reminders failed` : ""}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="hint mt-2 text-sm">Nothing failed to send.</p>
          )}
          <p className="hint mt-3 text-xs">
            Email: {totals.emailAnswered} answered, {totals.emailParked} parked for a person, {totals.emailIgnored} ignored as
            spam or automatic.
          </p>
        </div>
      </section>

      {/* ───────────────────────── what arrived by email, and what was decided */}
      <section className="card mt-6 p-5">
        <h2 className="section-title">What arrived by email, and what was done with it</h2>
        <p className="hint mt-1 text-sm">
          Every email reaching an inbound address leaves a line saying what was decided and why.
          Nothing about who wrote or what they said &mdash; the reason is the whole record, and a
          customer&rsquo;s mail lives in that business&rsquo;s own inbox where it belongs.
        </p>

        {arrivals.length === 0 ? (
          <p className="hint mt-3 text-sm">Nothing arrived by email in this range.</p>
        ) : (
          <>
            <div className="mt-3 flex flex-wrap gap-4 text-sm">
              <span>
                <strong className="tabular-nums">{arrivals.length}</strong> arrived
              </span>
              <span>
                <strong className="tabular-nums">{kept.answered}</strong> answered
              </span>
              <span>
                <strong className="tabular-nums">{kept.parked}</strong> put in front of a person
              </span>
              <span>
                <strong className="tabular-nums">{kept.junk}</strong> never reached anybody
              </span>
            </div>

            <ul className="mt-3 divide-y divide-border border-y border-border">
              {reasons.map((r) => (
                <li key={`${r.verdict}-${r.reason}`} className="flex flex-wrap items-baseline gap-x-3 py-2 text-sm">
                  <span className="tabular-nums font-semibold">{r.count}</span>
                  <span className="pill shrink-0">{r.verdict}</span>
                  <span className="min-w-0">{r.reason}</span>
                  {r.examples.length > 0 && (
                    <span className="hint w-full text-xs">
                      {r.examples.map((e) => `“${e}”`).join("  ·  ")}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {/* ─────────────────────────────────────────── every business */}
      <section className="card mt-6 p-5">
        <h2 className="section-title">Business by business</h2>
        {/*
          * The window, said again here.
          *
          * The front page counts everything since day one and this counts a
          * range, and both used the words "enquiries" and "booked" with
          * nothing on either screen saying which was which. Two honest numbers
          * that disagree look exactly like one wrong one.
          */}
        <p className="hint mt-1">
          {range.label}. Appointments are the ones starting in that window, and enquiries the
          conversations started in it &mdash; the front page counts everything since day one,
          which is why the two disagree.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                {["Business", "Plan", "Enquiries", "Booked", "Conv.", "To a person", "First reply", "Appts", "No-shows", "Taken", "Fees", "Assistant", "Texts", "Calls", "Calls cost", "Forms signed", "Last sign-in", "Quiet"].map((h) => (
                  <th key={h} className="whitespace-nowrap px-2 py-2 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {businesses.map((b) => (
                <Row key={b.id} b={b} pounds={pounds} />
              ))}
              <tr className="border-t-2 border-border font-semibold">
                <td className="px-2 py-2">All</td>
                <td className="px-2 py-2">{pounds(totals.planPence)}</td>
                <td className="px-2 py-2">{totals.enquiries}</td>
                <td className="px-2 py-2">{totals.booked}</td>
                <td className="px-2 py-2">{totals.conversionPercent == null ? "—" : `${totals.conversionPercent}%`}</td>
                <td className="px-2 py-2">{totals.handedToPerson}</td>
                <td className="px-2 py-2">{totals.medianFirstReplySeconds == null ? "—" : `${totals.medianFirstReplySeconds}s`}</td>
                <td className="px-2 py-2">{totals.appointments}</td>
                <td className="px-2 py-2">{totals.noShows}</td>
                <td className="px-2 py-2">{pounds(totals.grossPence)}</td>
                <td className="px-2 py-2">{pounds(totals.feesPence)}</td>
                <td className="px-2 py-2">{pounds(totals.aiCostPence)}</td>
                <td className="px-2 py-2">{totals.textsSent}</td>
                <td className="px-2 py-2">{totals.calls}</td>
                <td className="px-2 py-2">{pounds(totals.callCostPence)}</td>
                <td className="px-2 py-2">{totals.formsSigned}</td>
                <td className="px-2 py-2" />
                <td className="px-2 py-2" />
              </tr>
            </tbody>
          </table>
        </div>
        <p className="hint mt-2 text-xs">Texts are costed at about {TEXT_PENCE}p each. Check Twilio for the real bill.</p>
      </section>

      {/* ─────────────────────────────────────────── channels, trades, growth */}
      <section className="mt-6 grid gap-4 md:grid-cols-3">
        <div className="card p-5">
          <h2 className="section-title">Messages by channel</h2>
          <table className="mt-3 w-full text-sm tabular-nums">
            <thead>
              <tr className="text-left text-xs uppercase text-muted">
                <th className="py-1">Channel</th>
                <th className="py-1">In</th>
                <th className="py-1">Out</th>
              </tr>
            </thead>
            <tbody>
              {channels.map((c) => (
                <tr key={c} className="border-t border-border">
                  <td className="py-1.5">{c}</td>
                  <td className="py-1.5">{totals.inboundByChannel[c] ?? 0}</td>
                  <td className="py-1.5">{totals.repliesByChannel[c] ?? 0}</td>
                </tr>
              ))}
              {!channels.length && (
                <tr>
                  <td className="hint py-2" colSpan={3}>
                    No messages in this range.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {/*
          * Calls to somebody's own line, priced per person.
          *
          * Giles sells per instance, so the per-business total is not the
          * number he needs — he needs to know what one person's line cost him
          * this month. Only people with calls appear: a column of noughts for
          * everybody in every diary is a table nobody reads.
          *
          * Headed "Receptionist, by person" until now, and it is not that. It
          * is every call to a person's own line, whatever answered it — which
          * on a salon where Aisha simply has a number of her own is ordinary
          * voicemail-response carriage presented as the cost of an add-on she
          * has not got. The Receptionist is counted beside it, from the
          * switches that are actually sold.
          */}
        <div className="card p-5">
          <h2 className="section-title">Calls to a person&rsquo;s own line</h2>
          <p className="hint mt-1">
            Carriage, whatever answered it. Not the Receptionist, which is counted beside
            this.
          </p>
          <table className="mt-3 w-full text-sm tabular-nums">
            <thead>
              <tr className="text-left text-xs uppercase text-muted">
                <th className="py-1">Who</th>
                <th className="py-1">Calls</th>
                <th className="py-1">Cost</th>
              </tr>
            </thead>
            <tbody>
              {totals.callsByPerson.map((p) => (
                <tr key={p.name} className="border-t border-border">
                  <td className="py-1.5">{p.name}</td>
                  <td className="py-1.5">{p.calls}</td>
                  <td className="py-1.5">{pounds(p.pence)}</td>
                </tr>
              ))}
              {!totals.callsByPerson.length && (
                <tr>
                  <td className="hint py-2" colSpan={3}>
                    Nobody has a line of their own yet. Calls to a business&rsquo;s own number
                    are in the table above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/*
          * The Receptionist, counted as it is sold.
          *
          * From the switches rather than from calls, because that is the thing
          * being charged for: an instance costs whether it is rung or not, and
          * pricing it on usage would make a quiet month free. Nothing counts
          * on a business that has not been sold it, however many switches are
          * set, which is what makes stopping the add-on one change.
          *
          * No cost column, and that is deliberate rather than missing. The
          * talking agent is not built, so nothing is running and nothing has
          * been spent — a figure here today would be invented. The carriage
          * these lines already cost is in the table above.
          */}
        <div className="card p-5">
          <h2 className="section-title">Receptionist</h2>
          <p className="hint mt-1">Instances switched on, which is what is charged for.</p>
          <p className="mt-3 text-2xl tabular-nums">{totals.receptionists}</p>
          <p className="hint mt-2 max-w-prose">
            {totals.receptionists === 0
              ? "Nobody is running one yet."
              : `${totals.receptionists} line${totals.receptionists === 1 ? "" : "s"} switched on, counting each business's own line and each person separately.`}{" "}
            Not costed here: the agent that does the talking is not built, so nothing has
            been spent on it and a figure would be made up. What these lines cost to carry
            is in the table above.
          </p>
        </div>

        <div className="card p-5">
          <h2 className="section-title">By trade</h2>
          <table className="mt-3 w-full text-sm tabular-nums">
            <thead>
              <tr className="text-left text-xs uppercase text-muted">
                <th className="py-1">Trade</th>
                <th className="py-1">Enq.</th>
                <th className="py-1">Conv.</th>
                <th className="py-1">Taken</th>
              </tr>
            </thead>
            <tbody>
              {byTrade.map((t) => (
                <tr key={t.trade} className="border-t border-border">
                  <td className="py-1.5">
                    {t.label} <span className="hint">({t.businesses})</span>
                  </td>
                  <td className="py-1.5">{t.enquiries}</td>
                  <td className="py-1.5">{t.conversion == null ? "—" : `${t.conversion}%`}</td>
                  <td className="py-1.5">{pounds(t.gross)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card p-5">
          <h2 className="section-title">Businesses over time</h2>
          <table className="mt-3 w-full text-sm tabular-nums">
            <thead>
              <tr className="text-left text-xs uppercase text-muted">
                <th className="py-1">Month</th>
                <th className="py-1">Started</th>
                <th className="py-1">Stopped</th>
              </tr>
            </thead>
            <tbody>
              {report.growth.map((g) => (
                <tr key={g.month} className="border-t border-border">
                  <td className="py-1.5">
                    {new Date(`${g.month}-01T12:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}
                  </td>
                  <td className="py-1.5">{g.started}</td>
                  <td className="py-1.5">{g.stopped}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Tile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="card p-4">
      <div className="label">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      <div className="hint mt-0.5 text-xs">{note}</div>
    </div>
  );
}

function Row({ b, pounds }: { b: BusinessReport; pounds: (p: number) => string }) {
  const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "never");
  return (
    <tr className="border-t border-border">
      <td className="px-2 py-2">
        <div className="font-medium">{b.name}</div>
        <div className="hint text-xs">
          {verticalPack(b.trade).label} · {b.status}
        </div>
      </td>
      <td className="px-2 py-2">{b.planPence ? pounds(b.planPence) : "—"}</td>
      <td className="px-2 py-2">{b.enquiries}</td>
      <td className="px-2 py-2">{b.booked}</td>
      <td className="px-2 py-2">{b.conversionPercent == null ? "—" : `${b.conversionPercent}%`}</td>
      <td className="px-2 py-2">{b.handedToPerson}</td>
      <td className="px-2 py-2">{b.medianFirstReplySeconds == null ? "—" : `${b.medianFirstReplySeconds}s`}</td>
      <td className="px-2 py-2">{b.appointments}</td>
      <td className="px-2 py-2">{b.noShows}</td>
      <td className="px-2 py-2">{pounds(b.grossPence)}</td>
      <td className="px-2 py-2">{pounds(b.feesPence)}</td>
      <td className="px-2 py-2">{pounds(b.aiCostPence)}</td>
      <td className="px-2 py-2">{b.textsSent}</td>
      <td className="px-2 py-2">{b.calls}</td>
      {/*
        * What the telephone cost, on its own.
        *
        * The only channel billed by the minute, and the dearest per use:
        * ringing an owner's mobile for fifteen seconds bills a whole minute at
        * about six times the inbound rate. It sits beside texts rather than
        * inside them because "should we sell calls, and for how much" is a
        * different question from "what should a text cost".
        */}
      <td className="px-2 py-2">{b.callCostPence > 0 ? pounds(b.callCostPence) : "—"}</td>
      <td className="px-2 py-2">
        {b.formsSigned}/{b.formsSent}
      </td>
      <td className="whitespace-nowrap px-2 py-2">{day(b.lastSignIn)}</td>
      <td className="px-2 py-2">{b.daysQuiet == null ? "—" : `${b.daysQuiet}d`}</td>
    </tr>
  );
}
