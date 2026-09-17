import type { SupabaseClient } from "@supabase/supabase-js";
import { deliver } from "@/lib/messaging/deliver";
import { routesFor } from "@/lib/messaging/reach";
import { smsNumberFor, connectedChannels } from "@/lib/messaging/connections";
import { replyToFor } from "@/lib/messaging/replyTo";
import { worthAsking, reviewMessage, yesterdayIn, type Finished } from "@/lib/reviews";
import type { Studio } from "@/lib/types";

/**
 * Yesterday's appointments, asked about once.
 *
 * Runs from the nightly job, which is why it asks about yesterday rather than
 * an hour ago — and that is the right timing anyway. See reviews.ts.
 *
 * Claimed through `handled_messages`, the same table and unique index that stop
 * a webhook being handled twice. That means no new column to remember whether
 * somebody has been asked, and it means two instances cannot both ask.
 */
export async function askForReviews(
  db: SupabaseClient,
  studio: Studio,
  now: Date = new Date(),
): Promise<{ asked: number; failed: number; skipped: number }> {
  const result = { asked: 0, failed: 0, skipped: 0 };

  const url = (studio as unknown as { review_url?: string | null }).review_url?.trim();
  const on = (studio as unknown as { review_ask?: boolean | null }).review_ask === true;
  if (!on || !url) return result;

  const { from, to } = yesterdayIn(studio.timezone, now);

  /*
   * Through the people, because a booking does not carry the business.
   *
   * The same join the reminder sweep uses. An error here is not "nothing
   * happened yesterday" — it is a failure, and the caller counts it.
   */
  const { data, error } = await db
    .from("bookings")
    .select("id, ends_at, cancelled_at, contact_id, source, title, artists!inner(studio_id), contacts(name, phone, email)")
    .eq("artists.studio_id", studio.id)
    .gte("ends_at", from)
    .lt("ends_at", to)
    .limit(200);

  if (error) throw new Error(`could not read yesterday's appointments: ${error.message}`);

  const finished = (data ?? []) as unknown as (Finished & {
    title: string | null;
    contacts: { name: string | null; phone: string | null; email: string | null } | null;
  })[];

  const smsFrom = await smsNumberFor(db, studio.id);
  const connected = await connectedChannels(db, studio.id);

  for (const booking of worthAsking(finished, now)) {
    const person = (booking as unknown as { contacts: { name: string | null; phone: string | null; email: string | null } | null }).contacts;
    if (!person) {
      result.skipped++;
      continue;
    }

    // Once per appointment, whatever happens next.
    const { error: claimed } = await db
      .from("handled_messages")
      .insert({ message_id: `review:${booking.id}`, channel: "sms" });
    if (claimed) {
      result.skipped++;
      continue;
    }

    /*
     * Cold, by text or email.
     *
     * No conversation is passed in on purpose: a review request is not a reply
     * to anything, and the Meta window will have shut long before the morning
     * after. Those are the two channels that are open whenever we want them.
     */
    const route = routesFor({
      conversations: [],
      phone: person.phone,
      email: person.email,
      connected,
    }).find((r) => r.open);

    if (!route?.to) {
      result.skipped++;
      continue;
    }

    const text = reviewMessage({
      firstName: person.name?.split(" ")[0] ?? null,
      business: studio.name,
      what: (booking as unknown as { title: string | null }).title,
      url,
    });

    const sent = await deliver({
      channel: route.channel,
      to: route.to,
      body: text,
      from: route.channel === "sms" ? smsFrom : undefined,
      subject: `How did it go?`,
      fromName: studio.name,
      replyTo: replyToFor(studio),
      db,
      studioId: studio.id,
      /*
       * Not transactional.
       *
       * Asking for a review is a favour rather than a service message, so
       * somebody who has said STOP does not get one. deliver() applies that
       * for us; this flag is the whole decision.
       */
      transactional: false,
    });

    if (sent.status === "sent" || sent.status === "delivered") result.asked++;
    else if (sent.status === "not_needed") result.skipped++;
    else result.failed++;
  }

  return result;
}
