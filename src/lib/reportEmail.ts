import type { SupabaseClient } from "@supabase/supabase-js";
import type { Studio } from "@/lib/types";
import { weeklyReport } from "@/lib/report";
import { takingsFor } from "@/lib/takings";
import { howPaid, newAndReturning, type PaymentRow } from "@/lib/reportExtras";
import { whoHasNotBeenBack } from "@/lib/lapsed";
import { gapsAhead } from "@/lib/gapsAhead";
import { formatPence } from "@/lib/money";
import { wordsFor } from "@/lib/words";

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
): Promise<{ subject: string; text: string }> {
  const words = wordsFor(studio);
  const { from, to, title } = range;

  const [report, takings, payments, visitRows, slots, forms] = await Promise.all([
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

  const lines: string[] = [];
  lines.push(`Here is ${title.toLowerCase().startsWith("this") || title.toLowerCase().startsWith("last") ? title.toLowerCase() : title} at ${studio.name}.`);
  lines.push("");
  lines.push(
    `• ${report.enquiries} enquir${report.enquiries === 1 ? "y" : "ies"}, ${report.booked} booked in` +
      (report.enquiries ? ` (${Math.round((report.booked / report.enquiries) * 100)}%)` : ""),
  );
  if (report.recoveredPence > 0) lines.push(`• ${formatPence(report.recoveredPence)} booked from enquiries that came in while you were shut`);
  if (takings) lines.push(`• ${takings.bookings} ${plural(words.service, takings.bookings)} worth ${formatPence(takings.pence)}`);
  lines.push(`• ${formatPence(paid.total)} taken${paid.fees ? ` (Stripe kept ${formatPence(paid.fees)})` : ""}`);
  if (people.people) lines.push(`• ${people.new} new ${plural(words.customer, people.new)}, ${people.returning} returning`);
  if (report.noShows) lines.push(`• ${report.noShows} did not turn up — ${formatPence(report.noShowPence)} of work`);
  if (report.needsHuman) lines.push(`• ${report.needsHuman} conversation${report.needsHuman === 1 ? "" : "s"} waiting for you`);
  if (paid.waitingCount) lines.push(`• ${paid.waitingCount} payment link${paid.waitingCount === 1 ? "" : "s"} not paid yet (${formatPence(paid.waitingPence)})`);
  if (forms.data?.length) lines.push(`• ${forms.data.length} form${forms.data.length === 1 ? "" : "s"} still to be signed`);

  if (lapsed.length) {
    lines.push("");
    lines.push(`Worth a message — overdue by their own usual rhythm:`);
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

  return {
    subject: `${studio.name} — ${title}: ${report.booked} booked, ${formatPence(paid.total)} taken`,
    text: lines.join("\n"),
  };
}

function plural(word: string, n: number): string {
  if (n === 1) return word;
  if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh)$/i.test(word)) return `${word}es`;
  return `${word}s`;
}
