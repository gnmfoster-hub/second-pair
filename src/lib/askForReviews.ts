import type { SupabaseClient } from "@supabase/supabase-js";
import { reachOut } from "@/lib/messaging/reachOut";
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

  for (const booking of worthAsking(finished, now)) {
    const person = (booking as unknown as { contacts: { name: string | null; phone: string | null; email: string | null } | null }).contacts;
    if (!person) {
      result.skipped++;
      continue;
    }

    // Once per appointment, whatever happens next.
    /* Whose send this was, so it can be counted. See the migration: dedupe
       is message_id alone and is unchanged by this. */
    const { error: claimed } = await db
      .from("handled_messages")
      .insert({ message_id: `review:${booking.id}`, channel: "sms", studio_id: studio.id });
    if (claimed) {
      result.skipped++;
      continue;
    }

    const text = reviewMessage({
      firstName: person.name?.split(" ")[0] ?? null,
      business: studio.name,
      what: (booking as unknown as { title: string | null }).title,
      url,
      /*
       * Their wording if they have written one. Undefined until the migration
       * runs, which reads as "they never opened the screen" — the built-in
       * sentence, exactly as before.
       */
      template: (studio as unknown as { review_message?: string | null }).review_message ?? null,
    });

    /*
     * Through the customer's own thread, and written down.
     *
     * This used to call deliver() with no conversation at all, on the grounds
     * that a review ask is not a reply to anything. True, and it meant the ask
     * appeared nowhere, counted towards nothing, and left anybody who answered
     * it — "sorry, the colour went wrong" — starting a cold conversation the
     * assistant had no reason for. See reachOut.
     */
    const sent = await reachOut({
      db,
      studio,
      contact: { ...person, id: (booking as unknown as { contact_id: string }).contact_id },
      body: text,
      subject: "How did it go?",
      /*
       * Not transactional.
       *
       * Asking for a review is a favour rather than a service message, so
       * somebody who has said STOP does not get one. deliver() applies that
       * for us; this flag is the whole decision.
       */
      transactional: false,
    });

    /*
     * A claim spent on somebody we could not reach is given back.
     *
     * reachOut works the route out for itself, so "there is no way to reach
     * this person" is only known after the claim. Left claimed it is lost for
     * good — a booking is asked about once, and the key is the booking, so it
     * never comes round again. A business connecting a number next week would
     * silently never ask about any of this week's work.
     *
     * The same fault the MOT sweep had, in the place it matters more.
     *
     * A refusal stays claimed: somebody who has said STOP has not asked to be
     * asked again tomorrow.
     */
    if (sent.status === "no_route") {
      await db.from("handled_messages").delete().eq("message_id", `review:${booking.id}`);
      result.skipped++;
      continue;
    }

    if (sent.status === "sent" || sent.status === "delivered") result.asked++;
    else if (sent.status === "not_needed") result.skipped++;
    else result.failed++;
  }

  return result;
}
