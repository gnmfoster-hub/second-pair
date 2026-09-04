import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireStudio } from "@/lib/studio";
import { weeklyReport, lastWeek } from "@/lib/report";
import { formatPence } from "@/lib/money";

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
  /*
   * -1 is the week we are in; 0 is the last completed one.
   *
   * It used to stop at 0, so on a Friday afternoon there was no way to see how
   * the week was going — the page you would open to ask that question could
   * only show you the one before. The default is still the completed week,
   * because that is the one worth reviewing.
   */
  const back = Math.min(12, Math.max(-1, Number(weeks) || 0));
  const thisWeek = back === -1;

  const { studio } = await requireStudio();
  const supabase = await createClient();

  const now = new Date();
  const { from, to } = lastWeek(now, studio.timezone);
  from.setUTCDate(from.getUTCDate() - back * 7);
  to.setUTCDate(to.getUTCDate() - back * 7);

  // The week in progress ends now, not on a Monday that has not happened.
  if (thisWeek) to.setTime(now.getTime());

  const report = await weeklyReport(supabase, studio, from, to);

  /*
   * Proof that an empty week is a quiet week, not a broken page.
   *
   * The report defaults to the last completed week, so a business that started
   * on Monday opens it and sees nothing but zeros — which reads as the product
   * not working, and did. Pointing at "this week so far" helped, but it still
   * asked them to take it on trust and go and look. Counting what has arrived
   * since answers it on the spot: nothing last week, eleven this week, so the
   * assistant is plainly working and the page is showing the wrong seven days.
   *
   * Only fetched when the week really is empty, which is rare and is the one
   * time an extra query is worth it.
   */
  let sinceCount = 0;
  if (report.enquiries === 0 && !thisWeek) {
    const since = await weeklyReport(supabase, studio, to, now);
    sinceCount = since.enquiries;
  }

  const range = thisWeek
    ? `${from.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – today`
    : `${from.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${new Date(
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
        <h1 className="page-title">{thisWeek ? "This week so far" : "The week"}</h1>
        <span className="hint">{range}</span>
        <div className="ml-auto flex gap-2">
          <Link href={`/report?weeks=${back + 1}`} className="btn-ghost px-3">
            ←
          </Link>
          {back > -1 && (
            <Link href={`/report?weeks=${back - 1}`} className="btn-ghost px-3">
              →
            </Link>
          )}
        </div>
      </div>

      {/*
        * Why it is empty, before the emptiness.
        *
        * A business in its first week opens this and reads six zeros and two
        * dashes before it reaches the sentence at the bottom explaining that
        * the report covers the week before they existed. Six zeros is a
        * verdict; it should not be delivered before the reason.
        *
        * Only when nothing has ever come in. Once there is history, a quiet
        * week is a real answer and the figures are the point.
        */}
      {report.enquiries === 0 && sinceCount === 0 && (
        <p className="hint mt-5 max-w-lg">
          Nothing to report yet — this covers {range}, and the figures below fill in as
          enquiries arrive. They are what the assistant did while you were working.
        </p>
      )}

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
          detail="Handed over for a person to answer"
        />
      </div>

      {/*
       * What the assistant costs to run is not shown here any more.
       *
       * A business pays a fixed subscription. What the model happens to cost
       * behind that is our margin, and putting it on their week report invites
       * a question they should never have to think about — "am I being charged
       * for asking it things?" — which is exactly the hesitation that stops
       * somebody letting it answer everything.
       *
       * The figure still exists and is still worth watching. It lives in the
       * back office, beside the money it earns, where it is a business
       * decision rather than a customer's worry.
       */}

      {/*
       * An empty week is not the same as an empty business.
       *
       * This used to say "once the widget is on your site and the channels are
       * connected" whatever the reason, which reads as broken to somebody whose
       * widget is up and busy — the report simply defaults to the last complete
       * week, and their work is in this one. So it points at where the enquiries
       * actually are, when there are some.
       */}
      {/*
        * Only when the note at the top is not already saying it.
        *
        * Explaining the same emptiness above and below the figures is worse
        * than explaining it once in the wrong place, which is what it was.
        */}
      {report.enquiries === 0 && sinceCount > 0 && (
        <div className="mt-6">
          <p className="hint">
            Nothing came in {thisWeek ? "yet this week" : `between ${range}`}.
          </p>
          {!thisWeek && (
            <p className="hint mt-2">
              {sinceCount > 0 ? (
                <>
                  You&rsquo;ve had {sinceCount} since — the report shows the last completed
                  week by default, so yours are in{" "}
                  <Link href="/report?weeks=-1" className="text-accent hover:underline">
                    this week so far
                  </Link>
                  .
                </>
              ) : (
                <>
                  The report shows the last completed week by default.{" "}
                  <Link href="/report?weeks=-1" className="text-accent hover:underline">
                    See this week so far
                  </Link>
                  , or use the arrows to look further back.
                </>
              )}
            </p>
          )}
          {thisWeek && (
            <p className="hint mt-2">
              Once the widget is on your site and the channels are connected, this fills
              up on its own.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
