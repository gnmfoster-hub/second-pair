import Link from "next/link";
import { formatPence } from "@/lib/money";
import type { HowPaid } from "@/lib/reportExtras";

/**
 * How the money came in, who came, and when it is busy.
 *
 * The questions an owner asks of a month rather than of the assistant: is it
 * mostly cash, how much is Stripe keeping, are we finding new people or living
 * off regulars, and which afternoon is dead.
 */
export function MoneyAndPeople({
  paid,
  people,
  busy,
  forms,
  customers,
}: {
  paid: HowPaid;
  people: { people: number; new: number; returning: number };
  busy: { days: { label: string; count: number }[]; byHour: { hour: number; count: number }[]; busiestDay: string | null; busiestHour: number | null };
  forms: { waiting: number; signed: number } | null;
  customers: string;
}) {
  const maxDay = Math.max(1, ...busy.days.map((d) => d.count));
  const maxHour = Math.max(1, ...busy.byHour.map((h) => h.count));
  const hourLabel = (h: number) => `${h % 12 || 12}${h < 12 ? "am" : "pm"}`;

  return (
    <div className="mt-4 grid gap-4 md:grid-cols-2">
      <section className="card p-5">
        <h2 className="section-title">How it was paid</h2>
        {paid.count ? (
          <>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{formatPence(paid.total)}</div>
            <p className="hint text-sm">
              {paid.count} payment{paid.count === 1 ? "" : "s"}
              {paid.fees ? ` · Stripe kept ${formatPence(paid.fees)}` : ""}
              {paid.deposits ? ` · ${formatPence(paid.deposits)} in deposits` : ""}
            </p>
            <ul className="mt-3 space-y-1.5 text-sm">
              {paid.methods.map((m) => (
                <li key={m.method} className="flex items-baseline justify-between gap-3">
                  <span>
                    {m.label} <span className="hint">({m.count})</span>
                  </span>
                  <span className="tabular-nums">{formatPence(m.pence)}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="hint mt-2 text-sm">Nothing taken through Second Pair in this range.</p>
        )}
        {paid.waitingCount > 0 && (
          <p className="mt-3 rounded-lg bg-warn/10 px-3 py-2 text-sm text-warn">
            {paid.waitingCount} payment link{paid.waitingCount === 1 ? "" : "s"} not paid yet —{" "}
            {formatPence(paid.waitingPence)}.
          </p>
        )}
      </section>

      <section className="card p-5">
        <h2 className="section-title">Who came</h2>
        {people.people ? (
          <>
            <div className="mt-1 text-2xl font-semibold tabular-nums">
              {people.people} {people.people === 1 ? customers.replace(/s$/, "") : customers}
            </div>
            <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-surface-2" aria-hidden>
              <div className="bg-accent" style={{ width: `${Math.round((people.new / people.people) * 100)}%` }} />
            </div>
            <p className="mt-2 text-sm">
              <span className="font-medium">{people.new} new</span>
              <span className="hint"> — first time ever</span>
            </p>
            <p className="text-sm">
              <span className="font-medium">{people.returning} returning</span>
              <span className="hint"> — been before</span>
            </p>
          </>
        ) : (
          <p className="hint mt-2 text-sm">Nobody booked in for this range yet.</p>
        )}
        {forms && (forms.waiting > 0 || forms.signed > 0) && (
          <p className="hint mt-3 text-sm">
            Forms: {forms.signed} signed in this range
            {forms.waiting ? (
              <>
                {" · "}
                <Link href="/clients/forms" className="text-accent hover:underline">
                  {forms.waiting} still waiting
                </Link>
              </>
            ) : null}
          </p>
        )}
      </section>

      <section className="card p-5 md:col-span-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="section-title">When it is busy</h2>
          {busy.busiestDay && busy.busiestHour != null && (
            <span className="hint text-sm">
              Busiest on {busy.busiestDay}s, most often starting around {hourLabel(busy.busiestHour)}
            </span>
          )}
        </div>
        {busy.byHour.length ? (
          <div className="mt-4 grid gap-6 md:grid-cols-2">
            <div className="space-y-1.5">
              {busy.days.map((d) => (
                <div key={d.label} className="grid grid-cols-[2.5rem_1fr_2rem] items-center gap-2 text-sm">
                  <span className="hint">{d.label}</span>
                  <div className="h-3 rounded-full bg-surface-2">
                    <div className="h-3 rounded-full bg-accent" style={{ width: `${(d.count / maxDay) * 100}%` }} />
                  </div>
                  <span className="text-right tabular-nums">{d.count}</span>
                </div>
              ))}
            </div>
            <div className="flex h-36 items-end gap-1" aria-label="Appointments by starting hour">
              {busy.byHour.map((h) => (
                <div key={h.hour} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-[0.65rem] tabular-nums text-muted">{h.count}</span>
                  <div className="w-full rounded-t bg-accent/80" style={{ height: `${(h.count / maxHour) * 96}px` }} />
                  <span className="text-[0.65rem] text-muted">{hourLabel(h.hour)}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="hint mt-2 text-sm">No appointments in this range to count.</p>
        )}
      </section>
    </div>
  );
}
