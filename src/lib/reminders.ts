import type { SupabaseClient } from "@supabase/supabase-js";
import type { Studio } from "@/lib/types";
import { describeSlot } from "@/lib/booking";

/**
 * Reminders.
 *
 * Scheduled when a booking is made, rendered when they are sent. Rendering late
 * means an edited template does not rewrite reminders that have already gone
 * out, and a moved appointment says the right time.
 *
 * Delivery is deliberately pluggable: whichever channel the client came in on
 * is the one they hear back on. Until a channel is connected, a reminder still
 * becomes due and surfaces in the dashboard for the owner to send by hand —
 * which is more useful than silently doing nothing.
 */

export type PendingReminder = {
  id: string;
  booking_id: string;
  due_at: string;
  body: string | null;
  channel: string | null;
};

/**
 * Fills a template. Anything unrecognised is stripped rather than shown — a
 * client seeing "{{name}}" is worse than a slightly plainer sentence.
 */
export function renderReminder(
  template: string,
  values: {
    name?: string | null;
    practitioner?: string | null;
    business?: string | null;
    when?: string | null;
  },
): string {
  return template
    .replace(/\{\{\s*name\s*\}\}/gi, values.name?.trim() || "there")
    .replace(/\{\{\s*practitioner\s*\}\}/gi, values.practitioner?.trim() || "us")
    .replace(/\{\{\s*business\s*\}\}/gi, values.business?.trim() || "us")
    .replace(/\{\{\s*when\s*\}\}/gi, values.when?.trim() || "your appointment")
    .replace(/\{\{[^}]*\}\}/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/**
 * Schedules a booking's reminders.
 *
 * Only ones that would still land in the future — booking something for
 * tomorrow should not fire a "two days before" reminder immediately, or at all.
 */
export async function scheduleReminders(
  db: SupabaseClient,
  studioId: string,
  bookingId: string,
  startsAt: string,
): Promise<number> {
  const { data: templates } = await db
    .from("reminder_templates")
    .select("id, hours_before")
    .eq("studio_id", studioId)
    .eq("enabled", true);

  if (!templates?.length) return 0;

  const start = Date.parse(startsAt);
  const now = Date.now();

  const rows = templates
    .map((t) => ({
      booking_id: bookingId,
      template_id: t.id,
      due_at: new Date(start - t.hours_before * 3600_000).toISOString(),
    }))
    .filter((r) => Date.parse(r.due_at) > now);

  if (!rows.length) return 0;

  // Unique on (booking_id, template_id), so re-scheduling a moved booking
  // updates rather than duplicating.
  const { error } = await db
    .from("reminders")
    .upsert(rows, { onConflict: "booking_id,template_id" });

  return error ? 0 : rows.length;
}

/** Cancels anything still pending for a booking, e.g. when it is cancelled. */
export async function dropReminders(db: SupabaseClient, bookingId: string) {
  await db
    .from("reminders")
    .update({ status: "skipped" })
    .eq("booking_id", bookingId)
    .eq("status", "pending");
}

type DueRow = {
  id: string;
  due_at: string;
  template_id: string | null;
  bookings: {
    id: string;
    starts_at: string;
    cancelled_at: string | null;
    artists: { name: string; studio_id: string } | null;
    enquiries: {
      conversations: {
        id: string;
        channel: string;
        ai_paused: boolean;
        contacts: { name: string | null } | null;
      } | null;
    } | null;
  } | null;
};

export type SendResult = {
  due: number;
  sent: number;
  skipped: number;
  failed: number;
  /** Ready to send but with nowhere to send it — the owner does these by hand. */
  waiting: { id: string; body: string; who: string; when: string }[];
};

/**
 * Renders and delivers everything now due.
 *
 * Safe to call repeatedly: each reminder is one row, moved off `pending` the
 * moment it is handled, so a cron firing twice cannot send twice.
 */
export async function sendDueReminders(
  db: SupabaseClient,
  studio: Studio,
  now = new Date(),
): Promise<SendResult> {
  const { data } = await db
    .from("reminders")
    .select(
      "id, due_at, template_id, " +
        "bookings!inner(id, starts_at, cancelled_at, artists!inner(name, studio_id), " +
        "enquiries(conversations(id, channel, ai_paused, contacts(name))))",
    )
    .eq("status", "pending")
    .lte("due_at", now.toISOString())
    .limit(200);

  const rows = ((data ?? []) as unknown as DueRow[]).filter(
    (r) => r.bookings?.artists?.studio_id === studio.id,
  );

  const result: SendResult = { due: rows.length, sent: 0, skipped: 0, failed: 0, waiting: [] };
  if (!rows.length) return result;

  const { data: templates } = await db
    .from("reminder_templates")
    .select("id, body")
    .eq("studio_id", studio.id);
  const bodyFor = new Map((templates ?? []).map((t) => [t.id, t.body]));

  for (const row of rows) {
    const booking = row.bookings;
    const conversation = booking?.enquiries?.conversations;

    // A cancelled appointment must never be reminded about.
    if (!booking || booking.cancelled_at) {
      await db.from("reminders").update({ status: "skipped" }).eq("id", row.id);
      result.skipped++;
      continue;
    }

    const template = row.template_id ? bodyFor.get(row.template_id) : null;
    if (!template) {
      await db.from("reminders").update({ status: "skipped" }).eq("id", row.id);
      result.skipped++;
      continue;
    }

    const body = renderReminder(template, {
      name: conversation?.contacts?.name,
      practitioner: booking.artists?.name,
      business: studio.name,
      when: describeSlot(
        { starts_at: booking.starts_at, ends_at: booking.starts_at },
        studio.timezone,
      ),
    });

    // Web conversations get it in the thread they started, which is the only
    // channel wired up so far. SMS, WhatsApp and email land here next.
    if (conversation && conversation.channel === "web") {
      const { error } = await db.from("messages").insert({
        conversation_id: conversation.id,
        role: "assistant",
        content: body,
      });

      if (error) {
        await db
          .from("reminders")
          .update({ status: "failed", error: error.message })
          .eq("id", row.id);
        result.failed++;
        continue;
      }

      await db
        .from("reminders")
        .update({
          status: "sent",
          body,
          channel: conversation.channel,
          sent_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      result.sent++;
      continue;
    }

    // Nowhere to send it yet. Left pending and surfaced to the owner rather
    // than quietly marked done.
    result.waiting.push({
      id: row.id,
      body,
      who: conversation?.contacts?.name ?? "a client",
      when: describeSlot(
        { starts_at: booking.starts_at, ends_at: booking.starts_at },
        studio.timezone,
      ),
    });
  }

  return result;
}
