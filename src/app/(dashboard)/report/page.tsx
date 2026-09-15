import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireStudio } from "@/lib/studio";
import { weeklyReport } from "@/lib/report";
import { reportRange, REPORT_RANGES } from "@/lib/reportRange";
import { howPaid, newAndReturning, busiest, type PaymentRow } from "@/lib/reportExtras";
import { MoneyAndPeople } from "./MoneyAndPeople";
import { EmailMeThis } from "./EmailMeThis";
import { WeeklyEmailSwitch } from "./WeeklyEmailSwitch";
import { wordsFor } from "@/lib/words";
import { takingsFor, takingsByService } from "@/lib/takings";
import { Takings } from "./Takings";
import { formatPence } from "@/lib/money";
import { whoHasNotBeenBack } from "@/lib/lapsed";
import { NotBeenBack } from "./NotBeenBack";
import { gapsAhead } from "@/lib/gapsAhead";
import { GapsWorthFilling } from "./GapsWorthFilling";

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
  searchParams: Promise<{ weeks?: string; range?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;

  const { studio } = await requireStudio();
  const supabase = await createClient();
  const words = wordsFor(studio);
  const { data: membership } = await supabase
    .from("studio_members")
    .select("role")
    .eq("studio_id", studio.id)
    .eq("user_id", (await supabase.auth.getUser()).data.user?.id ?? "")
    .maybeSingle();
  const owns = membership?.role === "owner";

  const now = new Date();
  /*
   * The range: a week by default, as it always was, with the arrows — or a
   * month, last month, the quarter, the year, or two dates typed in.
   */
  const chosen = reportRange(params, now, studio.timezone);
  const { from, to } = chosen;
  const back = chosen.weeks ?? 0;
  const thisWeek = chosen.soFar;

  const report = await weeklyReport(supabase, studio, from, to);

  /*
   * What the week was worth, asked of the diary rather than of the
   * conversations.
   *
   * The report above measures what the assistant did, which is the right
   * question for "was this worth paying for" and the wrong one for "what did
   * we take" — a booking typed in by hand has no conversation, so none of it
   * counted. On the demo that is 105 of 111 bookings and five thousand pounds.
   */
  const [takings, byService] = await Promise.all([
    takingsFor(supabase, studio.id, from, to),
    studio.pricing_model === "services"
      ? takingsByService(supabase, studio.id, from, to)
      : Promise.resolve([]),
  ]);

  /*
   * Who has quietly stopped coming.
   *
   * Not about the week on screen. This is a standing question with the same
   * answer whichever week you happen to be looking at, and it sits at the
   * bottom because it is the part of this page somebody actually acts on.
   *
   * Two years of history, because the yardstick is each person's own rhythm
   * and somebody who comes twice a year needs several visits before there is a
   * rhythm to measure at all.
   */
  const twoYearsBack = new Date(now.getTime() - 730 * 86_400_000);
  const { data: visitRows } = await supabase
    .from("bookings")
    .select("contact_id, starts_at, price_pence, artists!inner(studio_id), contacts(name)")
    .eq("artists.studio_id", studio.id)
    .not("contact_id", "is", null)
    .is("cancelled_at", null)
    .eq("blocks_availability", true)
    .gte("starts_at", twoYearsBack.toISOString());

  const visits = (visitRows ?? []) as unknown as {
    contact_id: string;
    starts_at: string;
    price_pence: number | null;
    contacts: { name: string | null } | null;
  }[];

  const notBeenBack = whoHasNotBeenBack(
    visits.map((v) => ({
      contactId: v.contact_id,
      name: v.contacts?.name ?? null,
      at: v.starts_at,
      pence: v.price_pence,
    })),
    now,
    {
      /*
       * Anybody with something in the diary ahead is already coming back, and
       * a list that says to chase somebody booked in on Thursday is one
       * nobody reads twice.
       */
      booked: visits
        .filter((v) => Date.parse(v.starts_at) > now.getTime())
        .map((v) => v.contact_id),
    },
  );

  /*
   * What is nearly gone off the shelf.
   *
   * Only where the shop is counting — a null stock means it is not, and a
   * warning about a number nobody keeps would be noise on every report for
   * ever. Three is the line: enough warning to order before the last one goes.
   *
   * select("*") and filtered here rather than named in the query, so this
   * keeps working on either side of the migration that added the column.
   */
  const { data: shelf } = await supabase
    .from("services")
    .select("*")
    .eq("studio_id", studio.id)
    .eq("kind", "product")
    .eq("active", true);

  const runningLow = ((shelf ?? []) as { name: string; stock?: number | null }[])
    .filter((p) => p.stock != null && p.stock <= 3)
    .map((p) => ({ name: p.name, stock: p.stock as number }))
    .sort((a, b) => a.stock - b.stock);

  /*
   * The gaps in the week ahead that could be sold.
   *
   * The other half of "who hasn't been back". That list gives a salon people
   * to ring; this gives them something to offer, and the two together are the
   * whole of what a quiet week needs — otherwise a thing an owner worries
   * about on a Sunday and cannot act on.
   *
   * The week ahead, deliberately, whichever week the figures are showing:
   * nobody can sell last Tuesday's empty afternoon.
   */
  const openSlots = await gapsAhead(supabase, studio, now);
  const freeHours = Math.round(
    openSlots.reduce((total, slot) => total + slot.minutes, 0) / 60,
  );

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
  if (report.enquiries === 0 && !thisWeek && to.getTime() < now.getTime()) {
    const since = await weeklyReport(supabase, studio, to, now);
    sinceCount = since.enquiries;
  }

  const range = chosen.title;

  /*
   * Money, people and when it is busy — the parts of the report about the
   * business rather than about the assistant.
   */
  const [{ data: paymentRows }, { data: formRows }] = await Promise.all([
    supabase
      .from("payments")
      .select("kind, method, status, gross_pence, fee_pence, paid_at, created_at")
      .eq("studio_id", studio.id)
      .gte("created_at", new Date(from.getTime() - 31 * 86_400_000).toISOString()),
    supabase.from("client_forms").select("status, signed_at").eq("studio_id", studio.id).neq("status", "void"),
  ]);
  const paid = howPaid((paymentRows ?? []) as PaymentRow[], from, to);
  const people = newAndReturning(
    visits.map((v) => ({ contactId: v.contact_id, at: v.starts_at })),
    from,
    to,
    now,
  );
  const busy = busiest(
    visits
      .filter((v) => Date.parse(v.starts_at) >= from.getTime() && Date.parse(v.starts_at) < to.getTime())
      .map((v) => v.starts_at),
    studio.timezone,
  );
  const forms = formRows
    ? {
        waiting: formRows.filter((f) => f.status === "sent" || f.status === "opened").length,
        signed: formRows.filter(
          (f) => f.signed_at && Date.parse(f.signed_at as string) >= from.getTime() && Date.parse(f.signed_at as string) < to.getTime(),
        ).length,
      }
    : null;

  const responded =
    report.medianFirstResponseSeconds == null
      ? "—"
      : report.medianFirstResponseSeconds < 60
        ? `${Math.round(report.medianFirstResponseSeconds)}s`
        : `${Math.round(report.medianFirstResponseSeconds / 60)}m`;

  return (
    <div className="mx-auto max-w-4xl px-8 py-9">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
        <h1 className="page-title">{range}</h1>
        {chosen.weeks != null && (
          <div className="ml-auto flex gap-2">
            <Link href={`/report?weeks=${back + 1}`} className="btn-ghost px-3" aria-label="The week before">
              ←
            </Link>
            {back > -1 && (
              <Link href={`/report?weeks=${back - 1}`} className="btn-ghost px-3" aria-label="The week after">
                →
              </Link>
            )}
          </div>
        )}
      </div>

      {/*
        * Any stretch of time, not only a week.
        *
        * A plain form, so it works without any script and the address can be
        * bookmarked or sent to an accountant.
        */}
      <form method="get" className="mt-4 flex flex-wrap items-end gap-2">
        <div className="flex w-full flex-wrap gap-1.5">
          {REPORT_RANGES.map((r) => (
            <Link
              key={r.key}
              href={`/report?range=${r.key}`}
              className={`rounded-full border px-3 py-1 text-xs ${
                chosen.key === r.key ? "border-accent bg-accent text-on-accent" : "border-border hover:border-accent"
              }`}
            >
              {r.label}
            </Link>
          ))}
        </div>
        <label className="text-xs">
          <span className="label">From</span>
          <input id="report-from" type="date" name="from" defaultValue={params.from ?? ""} className="input py-1 text-sm" />
        </label>
        <label className="text-xs">
          <span className="label">To</span>
          <input id="report-to" type="date" name="to" defaultValue={params.to ?? ""} className="input py-1 text-sm" />
        </label>
        <button className="btn border border-border py-1.5 text-sm">Show</button>
        <div className="ml-auto">
          <EmailMeThis range={{ range: params.range, from: params.from, to: params.to, weeks: params.weeks }} />
        </div>
      </form>

      {owns && (
        <div className="mt-3">
          <WeeklyEmailSwitch on={(studio as { weekly_report_email?: boolean }).weekly_report_email === true} />
        </div>
      )}

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

        {/*
         * Empty chairs, and what they were worth.
         *
         * The count has been calculated since the report was written and shown
         * nowhere — and until this week it could only ever have been zero,
         * because nothing in the product could record a no-show. Both halves
         * are fixed now, so the figure is worth a tile.
         *
         * The money is the point. Four no-shows sounds like bad luck; £340
         * sounds like a deposit policy, and the owner is the only person who
         * can tell which of the two it was.
         *
         * Shown only once there is one. A nil return every week teaches
         * somebody to stop reading the row, and then they miss the week it is
         * not nil.
         */}
        {report.noShows > 0 && (
          <Stat
            tone="warn"
            value={String(report.noShows)}
            label="Did not turn up"
            detail={`${formatPence(report.noShowPence)} of work that did not happen`}
          />
        )}
      </div>

      {/* What the week came to, from the diary rather than the conversations. */}
      <Takings figures={takings} byService={byService} runningLow={runningLow} />

      <MoneyAndPeople paid={paid} people={people} busy={busy} forms={forms} customers={words.customers} />

      <NotBeenBack people={notBeenBack} />

      <GapsWorthFilling slots={openSlots} hours={freeHours} />

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
