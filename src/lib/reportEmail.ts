import type { SupabaseClient } from "@supabase/supabase-js";
import type { Studio } from "@/lib/types";
import { weeklyReport } from "@/lib/report";
import { takingsFor } from "@/lib/takings";
import { howPaid, newAndReturning, type PaymentRow } from "@/lib/reportExtras";
import { whoHasNotBeenBack } from "@/lib/lapsed";
import { gapsAhead } from "@/lib/gapsAhead";
import { formatPence } from "@/lib/money";
import { wordsFor } from "@/lib/words";
import { whereTheWorkIs, howJobsRan, weekShapeLines } from "@/lib/reportShape";
import { reportLetterHtml, type Figure } from "@/lib/reportLetter";

/**
 * A business's report, as an email somebody reads over a coffee on Monday.
 *
 * The product has always said the weekly report is one of the things email is
 * for, and nothing ever sent one. This is the page in six lines: what came in,
 * what was booked, what was taken, who did not turn up, who to ring, and the
 * gaps worth filling — with a link to the whole thing.
 */
export async function buildReportEmail(
  db: SupabaseClient,
  studio: Studio,
  range: { from: Date; to: Date; title: string },
  origin: string,
  now: Date = new Date(),
): Promise<{ subject: string; text: string; html: string }> {
  const words = wordsFor(studio);
  const { from, to, title } = range;

  const [report, takings, payments, visitRows, slots, forms, jobRows] = await Promise.all([
    weeklyReport(db, studio, from, to),
    takingsFor(db, studio.id, from, to).catch(() => null),
    db
      .from("payments")
      .select("kind, method, status, gross_pence, fee_pence, paid_at, created_at")
      .eq("studio_id", studio.id)
      .gte("created_at", new Date(from.getTime() - 31 * 86_400_000).toISOString()),
    db
      .from("bookings")
      .select("contact_id, starts_at, price_pence, artists!inner(studio_id), contacts(name)")
      .eq("artists.studio_id", studio.id)
      .not("contact_id", "is", null)
      .is("cancelled_at", null)
      .eq("blocks_availability", true)
      .gte("starts_at", new Date(now.getTime() - 730 * 86_400_000).toISOString()),
    gapsAhead(db, studio, now).catch(() => []),
    db.from("client_forms").select("status").eq("studio_id", studio.id).in("status", ["sent", "opened"]),
    /*
     * The week's jobs, with where they were and how long they really took.
     *
     * The same two facts the report page grew: an owner who reads the email
     * on a Monday and never opens the page is exactly the one who should be
     * told that every job ran twenty minutes over.
     */
    db
      .from("bookings")
      .select("price_pence, starts_at, ends_at, actual_minutes, artists!inner(studio_id), enquiries(job_postcode)")
      .eq("artists.studio_id", studio.id)
      .is("cancelled_at", null)
      .eq("blocks_availability", true)
      .gte("starts_at", from.toISOString())
      .lt("starts_at", to.toISOString()),
  ]);

  const paid = howPaid((payments.data ?? []) as PaymentRow[], from, to);
  const visits = (visitRows.data ?? []) as unknown as {
    contact_id: string;
    starts_at: string;
    price_pence: number | null;
    contacts: { name: string | null } | null;
  }[];
  const people = newAndReturning(visits.map((v) => ({ contactId: v.contact_id, at: v.starts_at })), from, to, now);
  const lapsed = whoHasNotBeenBack(
    visits.map((v) => ({ contactId: v.contact_id, name: v.contacts?.name ?? null, at: v.starts_at, pence: v.price_pence })),
    now,
    { booked: visits.filter((v) => Date.parse(v.starts_at) > now.getTime()).map((v) => v.contact_id) },
  );
  const freeHours = Math.round(slots.reduce((n, s) => n + s.minutes, 0) / 60);

  const jobs = ((jobRows.data ?? []) as unknown as {
    price_pence: number | null;
    starts_at: string;
    ends_at: string;
    actual_minutes: number | null;
    enquiries: { job_postcode: string | null } | null;
  }[]).map((j) => ({
    postcode: j.enquiries?.job_postcode ?? null,
    pence: j.price_pence ?? 0,
    booked: Math.round((Date.parse(j.ends_at) - Date.parse(j.starts_at)) / 60000),
    actual: j.actual_minutes,
  }));

  const where = studio.travel_mode !== "at_premises" ? whereTheWorkIs(jobs, 3) : { areas: [], unknown: 0 };
  const running = howJobsRan(jobs);

  const lines: string[] = [];
  lines.push(`Here is ${title.toLowerCase().startsWith("this") || title.toLowerCase().startsWith("last") ? title.toLowerCase() : title} at ${studio.name}.`);
  lines.push("");
  lines.push(
    `• ${report.enquiries} enquir${report.enquiries === 1 ? "y" : "ies"}, ${report.booked} booked in` +
      (report.enquiries ? ` (${Math.round((report.booked / report.enquiries) * 100)}%)` : ""),
  );
  if (report.recoveredPence > 0) lines.push(`• ${formatPence(report.recoveredPence)} booked from enquiries that came in while you were shut`);
  if (takings) lines.push(`• ${takings.bookings} ${plural(words.service, takings.bookings)} worth ${formatPence(takings.pence)}`);
  lines.push(
    paid.total > 0
      ? `• ${formatPence(paid.total)} taken${paid.fees ? ` (Stripe kept ${formatPence(paid.fees)})` : ""}`
      : `• nothing was recorded as paid through Second Pair`,
  );
  if (people.people) lines.push(`• ${people.new} new ${plural(words.customer, people.new)}, ${people.returning} returning`);
  if (report.noShows) lines.push(`• ${report.noShows} did not turn up, which was ${formatPence(report.noShowPence)} of work`);
  if (report.needsHuman) lines.push(`• ${report.needsHuman} conversation${report.needsHuman === 1 ? "" : "s"} waiting for you`);
  if (paid.waitingCount) lines.push(`• ${paid.waitingCount} payment link${paid.waitingCount === 1 ? "" : "s"} not paid yet (${formatPence(paid.waitingPence)})`);
  if (forms.data?.length) lines.push(`• ${forms.data.length} form${forms.data.length === 1 ? "" : "s"} still to be signed`);

  /* Where the work was, and whether it ran to time. Both worded in
     reportShape, where they are tested. */
  lines.push(
    ...weekShapeLines({
      where,
      running,
      service: words.service,
      services: plural(words.service, 2),
      money: formatPence,
    }),
  );

  if (lapsed.length) {
    lines.push("");
    lines.push(`Worth a message, overdue by their own usual rhythm:`);
    for (const p of lapsed.slice(0, 3)) {
      lines.push(`• ${p.name ?? "Somebody unnamed"}, last in ${p.daysSince} days ago (usually every ${p.usualGapDays})`);
    }
  }
  if (freeHours > 0) {
    lines.push("");
    lines.push(`${freeHours} hour${freeHours === 1 ? "" : "s"} free in the week ahead that could be filled.`);
  }
  lines.push("");
  lines.push(`The full report: ${origin}/report`);

  /*
   * The same figures, drawn.
   *
   * Built from the values the text above was built from, not from the text:
   * a second pass over nine sentences would be a parser, and the first time
   * somebody reworded a bullet the layout would quietly lose a row.
   *
   * The two halves are not identical and should not be. The text is a list
   * because that is all text can be. The html puts the three figures an owner
   * opens this for into tiles, the money in a column that adds up, and the
   * people worth ringing in a list beside a button. Nothing is in one half
   * and missing from the other.
   */
  /*
   * What the week is worth, and the trap in saying it.
   *
   * paid.total is money recorded through Second Pair. For all three live
   * businesses that is nought: Living Canvas takes payment through Shopify,
   * Neat & Tidy is paid by bank transfer, and Amber's is paid on the day. So
   * the first draft of this email opened with a tile reading "£0 taken" over
   * a week in which Living Canvas did £700 of tattooing, which is true of
   * Stripe and a lie about the week.
   *
   * So the headline figure is the money taken where there is any, and the
   * value of the work booked where there is not. The other is still in the
   * money table underneath, said in full, because "nothing was recorded as
   * paid" is a thing an owner should be able to see rather than a thing to
   * hide behind a nicer number.
   */
  const headline =
    paid.total > 0
      ? { value: formatPence(paid.total), label: "taken" }
      : takings && takings.pence > 0
        ? { value: formatPence(takings.pence), label: "of work booked" }
        : { value: formatPence(0), label: "taken" };

  const money: Figure[] = [
    {
      label: "Taken",
      value: formatPence(paid.total),
      note: paid.count
        ? `${paid.count} payment${paid.count === 1 ? "" : "s"}`
        : "nothing was recorded as paid through Second Pair",
    },
    ...(paid.fees ? [{ label: "Stripe kept", value: formatPence(paid.fees) }] : []),
    ...(paid.deposits ? [{ label: "Of that, deposits", value: formatPence(paid.deposits) }] : []),
    ...(paid.waitingCount
      ? [
          {
            label: "Not paid yet",
            value: formatPence(paid.waitingPence),
            note: `${paid.waitingCount} payment link${paid.waitingCount === 1 ? "" : "s"} sent and still open`,
            bad: true,
          },
        ]
      : []),
    ...(report.recoveredPence > 0
      ? [
          {
            label: "Booked while you were shut",
            value: formatPence(report.recoveredPence),
            note: "from enquiries that came in out of hours",
          },
        ]
      : []),
  ];

  const week: Figure[] = [
    ...(report.enquiries
      ? [
          {
            label: "Enquiries that booked",
            value: `${Math.round((report.booked / report.enquiries) * 100)}%`,
            note: `${report.booked} of ${report.enquiries}`,
          },
        ]
      : []),
    ...(takings
      ? [
          {
            label: `${cap(plural(words.service, takings.bookings))} booked`,
            value: String(takings.bookings),
            note: `worth ${formatPence(takings.pence)}`,
          },
        ]
      : []),
    ...(people.people
      ? [
          { label: `New ${plural(words.customer, people.new)}`, value: String(people.new) },
          { label: "Coming back", value: String(people.returning) },
        ]
      : []),
    ...(report.noShows
      ? [
          {
            label: "Did not turn up",
            value: String(report.noShows),
            note: `${formatPence(report.noShowPence)} of work`,
            bad: true,
          },
        ]
      : []),
    ...(report.needsHuman
      ? [
          {
            label: "Waiting for you",
            value: String(report.needsHuman),
            note: `conversation${report.needsHuman === 1 ? "" : "s"} the assistant handed over`,
            bad: true,
          },
        ]
      : []),
    ...(forms.data?.length ? [{ label: "Forms still to be signed", value: String(forms.data.length) }] : []),
  ];

  /* The dates it covers, in words, because "last week" is not a date. */
  const period = (() => {
    const show = (d: Date) =>
      new Intl.DateTimeFormat("en-GB", {
        timeZone: studio.timezone ?? "Europe/London",
        day: "numeric",
        month: "long",
      }).format(d);
    /* to is exclusive, so the last day it covers is the one before it. */
    return `${show(from)} to ${show(new Date(to.getTime() - 86_400_000))}`;
  })();

  const html = reportLetterHtml({
    business: studio.name,
    title,
    period,
    tiles: [
      { value: String(report.enquiries), label: `enquir${report.enquiries === 1 ? "y" : "ies"}` },
      { value: String(report.booked), label: "booked in" },
      headline,
    ],
    money,
    week,
    notes: weekShapeLines({
      where,
      running,
      service: words.service,
      services: plural(words.service, 2),
      money: formatPence,
    }),
    lapsed: lapsed.slice(0, 3).map((p) => ({
      name: p.name ?? "Somebody unnamed",
      detail: `Last in ${p.daysSince} days ago, and usually comes every ${p.usualGapDays}`,
    })),
    ahead:
      freeHours > 0
        ? `${freeHours} hour${freeHours === 1 ? "" : "s"} free in the week ahead that could be filled.`
        : null,
    reportUrl: `${origin}/report`,
  });

  return {
    /*
     * The subject, which is most of what gets read.
     *
     * It said "0 booked, £0 taken" for every one of the three live businesses,
     * which is a subject line somebody learns to leave unopened. Worse, with
     * the headline figure fixed it then read "0 booked, £90 of work booked",
     * contradicting itself: booked counts enquiries that turned into
     * appointments, and the money counts the appointments that happened, so a
     * week of regulars booked a fortnight ago is nought and £90 at once.
     *
     * Money and enquiries, then, which do not argue with each other.
     */
    subject:
      `${studio.name}, ${title}: ${headline.value} ${paid.total > 0 ? "taken" : "of work"}, ` +
      `${report.enquiries} enquir${report.enquiries === 1 ? "y" : "ies"}`,
    text: lines.join("\n"),
    html,
  };
}

/*
 * A trade's own word for what it sells, at the start of a line.
 *
 * The vocabulary holds "tattoo", "clean", "walk" — written as they are used
 * mid-sentence, which is right everywhere else in the product and wrong as
 * the first word of a row in a table. The first draft of the drawn report had
 * a line reading "tattoos booked" under a capitalised heading.
 */
function cap(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function plural(word: string, n: number): string {
  if (n === 1) return word;
  if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh)$/i.test(word)) return `${word}es`;
  return `${word}s`;
}
