import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireStudio } from "@/lib/studio";
import { weeklyReport, lastWeek } from "@/lib/report";
import { formatPence } from "@/lib/money";
import { verticalPack } from "@/lib/verticals";

function Stat({
  value,
  label,
  detail,
  tone = "plain",
}: {
  value: string;
  label: string;
  detail?: string;
  tone?: "plain" | "headline" | "warn";
}) {
  return (
    <div
      className={`card p-5 ${tone === "headline" ? "border-accent/40 bg-accent/5" : ""}`}
    >
      <div
        className={`text-3xl font-semibold tracking-tight tabular-nums ${
          tone === "headline" ? "text-accent" : tone === "warn" ? "text-warn" : ""
        }`}
      >
        {value}
      </div>
      <div className="mt-1 text-sm">{label}</div>
      {detail && <p className="hint mt-1">{detail}</p>}
    </div>
  );
}

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ weeks?: string }>;
}) {
  const { weeks } = await searchParams;
  const back = Math.min(12, Math.max(0, Number(weeks) || 0));

  const { studio } = await requireStudio();
  const supabase = await createClient();

  const { from, to } = lastWeek(new Date(), studio.timezone);
  from.setUTCDate(from.getUTCDate() - back * 7);
  to.setUTCDate(to.getUTCDate() - back * 7);

  const report = await weeklyReport(supabase, studio, from, to);
  const pack = verticalPack(studio.vertical);
  const words = { ...pack.vocabulary, ...(studio.vocabulary ?? {}) };

  const range = `${from.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${new Date(
    to.getTime() - 86400000,
  ).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;

  const responded =
    report.medianFirstResponseSeconds == null
      ? "—"
      : report.medianFirstResponseSeconds < 60
        ? `${Math.round(report.medianFirstResponseSeconds)}s`
        : `${Math.round(report.medianFirstResponseSeconds / 60)}m`;

  return (
    <div className="mx-auto max-w-4xl px-8 py-9">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
        <h1 className="page-title">The week</h1>
        <span className="hint">{range}</span>
        <div className="ml-auto flex gap-2">
          <Link href={`/report?weeks=${back + 1}`} className="btn-ghost px-3">
            ←
          </Link>
          {back > 0 && (
            <Link href={`/report?weeks=${back - 1}`} className="btn-ghost px-3">
              →
            </Link>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat
          tone="headline"
          value={formatPence(report.recoveredPence)}
          label="Recovered"
          detail={
            report.recoveredBookings
              ? `${report.recoveredBookings} booking${report.recoveredBookings === 1 ? "" : "s"} from enquiries that came in while you were shut`
              : "Work booked from enquiries that arrived outside opening hours"
          }
        />
        <Stat
          value={responded}
          label="Median first reply"
          detail="From their message to your assistant's answer"
        />
        <Stat
          value={String(report.enquiries)}
          label="Enquiries"
          detail={`${report.outOfHours} arrived out of hours`}
        />
        <Stat
          value={String(report.booked)}
          label="Booked in"
          detail={
            report.enquiries
              ? `${Math.round((report.booked / report.enquiries) * 100)}% of enquiries`
              : undefined
          }
        />
        <Stat
          value={formatPence(report.depositsPaidPence)}
          label="Deposits taken"
          detail={formatPence(report.quotedValuePence) + " of work quoted"}
        />
        <Stat
          tone={report.needsHuman ? "warn" : "plain"}
          value={String(report.needsHuman)}
          label="Waiting on you"
          detail={`Handed over for a ${words.practitioner} to answer`}
        />
      </div>

      <div className="card mt-6 p-5">
        <h2 className="section-title">What it cost</h2>
        <p className="hint mt-1">
          The assistant ran for {formatPence(report.aiCostPence)} this week
          {report.recoveredPence > 0 && report.aiCostPence > 0
            ? ` — ${Math.round(report.recoveredPence / Math.max(1, report.aiCostPence))}× that in recovered work.`
            : "."}
        </p>
      </div>

      {report.enquiries === 0 && (
        <p className="hint mt-6">
          Nothing came in during this week. Once the widget is on your site and the
          channels are connected, this fills up on its own.
        </p>
      )}
    </div>
  );
}
