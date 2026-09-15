import type { SupabaseClient } from "@supabase/supabase-js";
import type { Studio } from "@/lib/types";
import { localParts } from "@/lib/booking/tz";
import { reportRange } from "@/lib/reportRange";
import { buildReportEmail } from "@/lib/reportEmail";
import { sendEmail } from "@/lib/messaging/email";

/**
 * Last week's report to the owners of every business that turned it on.
 *
 * Runs inside the job that wakes every few minutes, so it has to send once:
 * on a Monday in the business's own time, from seven in the morning, and only
 * after claiming the day on the business's row. Two runs a minute apart both
 * try to claim; one succeeds, and only that one sends.
 */
export async function sendWeeklyReports(
  db: SupabaseClient,
  studios: Studio[],
  origin: string,
  now: Date = new Date(),
): Promise<{ sent: number; failed: string[] }> {
  let sent = 0;
  const failed: string[] = [];

  for (const studio of studios) {
    const row = studio as Studio & { weekly_report_email?: boolean; weekly_report_sent_on?: string | null };
    if (!row.weekly_report_email || studio.archived_at || studio.kind === "demo") continue;

    const tz = studio.timezone ?? "Europe/London";
    const { year, month, day, weekday } = localParts(now, tz);
    const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hour12: false }).format(now)) % 24;
    if (weekday !== 1 || hour < 7) continue;

    const today = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (row.weekly_report_sent_on === today) continue;

    // Claim the day before sending, so a second run cannot send it again.
    const { data: claimed } = await db
      .from("studios")
      .update({ weekly_report_sent_on: today })
      .eq("id", studio.id)
      .or(`weekly_report_sent_on.is.null,weekly_report_sent_on.neq.${today}`)
      .select("id");
    if (!claimed?.length) continue;

    try {
      const { data: owners } = await db.from("studio_members").select("user_id").eq("studio_id", studio.id).eq("role", "owner");
      const emails: string[] = [];
      for (const o of owners ?? []) {
        const { data } = await db.auth.admin.getUserById(o.user_id as string);
        if (data.user?.email) emails.push(data.user.email);
      }
      if (!emails.length) continue;

      const range = reportRange({}, now, tz);
      const { subject, text } = await buildReportEmail(db, studio, range, origin, now);
      for (const to of emails) {
        const result = await sendEmail({ to, subject, text, fromName: "Second Pair" });
        if (result.status === "failed") failed.push(`${studio.name}: ${result.error ?? "did not send"}`);
        else sent += 1;
      }
    } catch (e) {
      failed.push(`${studio.name}: ${(e as Error).message}`);
    }
  }

  return { sent, failed };
}
