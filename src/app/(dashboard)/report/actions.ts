"use server";

import { requireStudio } from "@/lib/studio";
import { createClient } from "@/lib/supabase/server";
import { siteOrigin } from "@/lib/origin";
import { reportRange } from "@/lib/reportRange";
import { buildReportEmail } from "@/lib/reportEmail";
import { sendEmail } from "@/lib/messaging/email";

export type EmailReportState = { ok?: boolean; error?: string; to?: string };

/**
 * The report on screen, sent to whoever is looking at it.
 *
 * Only ever to the signed-in person's own address, so pressing it cannot send
 * a business's figures anywhere else — and it is how an owner sees what the
 * Monday email will look like before it is switched on.
 */
export async function emailMeReport(_prev: EmailReportState, fd: FormData): Promise<EmailReportState> {
  const { studio } = await requireStudio();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: "Your login has no email address to send it to." };

  const read = (k: string) => {
    const v = String(fd.get(k) ?? "").trim();
    return v || undefined;
  };
  const range = reportRange(
    { range: read("range"), from: read("from"), to: read("to"), weeks: read("weeks") },
    new Date(),
    studio.timezone,
  );

  const { subject, text } = await buildReportEmail(supabase, studio, range, await siteOrigin());
  const sent = await sendEmail({ to: user.email, subject, text, fromName: "Second Pair" });
  if (sent.status === "failed") return { error: sent.error ?? "It would not send. Try again in a minute." };

  return { ok: true, to: user.email };
}

/** Turn the Monday email on or off for this business. The owner's call. */
export async function setWeeklyEmail(_prev: EmailReportState, fd: FormData): Promise<EmailReportState> {
  const { studio } = await requireStudio();
  const supabase = await createClient();
  const { data: member } = await supabase
    .from("studio_members")
    .select("role")
    .eq("studio_id", studio.id)
    .eq("user_id", (await supabase.auth.getUser()).data.user?.id ?? "")
    .maybeSingle();
  if (member?.role !== "owner") return { error: "Only the owner can change this." };

  const on = fd.get("on") === "on";
  const { error } = await supabase.from("studios").update({ weekly_report_email: on }).eq("id", studio.id);
  if (error) {
    return { error: /column/i.test(error.message) ? "This needs a small database update first." : error.message };
  }
  return { ok: true };
}
