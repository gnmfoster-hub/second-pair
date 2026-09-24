import type { SupabaseClient } from "@supabase/supabase-js";
import type { Studio } from "@/lib/types";
import { dueNow, type Campaign, type PastBooking } from "@/lib/campaigns";
import { renderReminder } from "@/lib/reminderText";
import { buildEmail } from "@/lib/messaging/emailTemplate";
import { avatarUrl } from "@/components/Avatar";
import { sendEmail, emailConfigured } from "@/lib/messaging/email";
import { sendSms, smsConfigured } from "@/lib/messaging/sms";
import { smsNumberFor } from "@/lib/messaging/connections";
import { isOptedOut } from "@/lib/messaging/optOut";
import { forOneText } from "@/lib/reminderText";
import { type MarketingBusiness } from "@/lib/marketingPlan";

/**
 * Sending the campaigns that have fallen due.
 *
 * Runs on the same sweep as everything else, last, and can never fail it:
 * somebody's reminder is worth more than somebody's offer, and an offer that
 * misses a day is worth nothing at all compared to a reminder that does.
 *
 * The rules are in campaigns.ts, which is pure and tested. This is the part
 * that reaches the database and the network, and it is deliberately dull.
 *
 * Every send is claimed in handled_messages before it goes, under a key made
 * of the campaign and the booking. That table already exists for exactly this,
 * has a unique index doing the work, and is swept — so two overlapping sweeps
 * cannot both write to the same person, and neither can a redeploy mid-run.
 */

export type CampaignResult = { sent: number; skipped: number; failed: number };

export async function sendCampaigns(
  db: SupabaseClient,
  studio: Studio,
  origin: string,
  now: Date = new Date(),
): Promise<CampaignResult> {
  const result: CampaignResult = { sent: 0, skipped: 0, failed: 0 };

  try {
    const business = studio as unknown as MarketingBusiness;

    /*
     * Nothing to do for the overwhelming majority of businesses, and this is
     * the cheapest possible way to find that out — one query that usually
     * comes back empty, before anything else is read.
     */
    const { data: campaigns, error } = await db
      .from("campaigns")
      .select("*")
      .eq("studio_id", studio.id)
      .eq("enabled", true);

    /* The table arrives with a migration; until then there is nothing to send. */
    if (error || !campaigns?.length) return result;

    /*
     * Only bookings old enough for the longest campaign, and no older than a
     * day past it. Asked of the database rather than filtered afterwards,
     * because "every booking this business has ever taken" is the wrong thing
     * to pull into memory on a sweep that runs all night.
     */
    const longest = Math.max(...campaigns.map((c) => c.after_days as number));
    const shortest = Math.min(...campaigns.map((c) => c.after_days as number));
    const from = new Date(now.getTime() - (longest + 2) * 86_400_000).toISOString();
    const to = new Date(now.getTime() - shortest * 86_400_000).toISOString();

    const { data: people } = await db.from("artists").select("id").eq("studio_id", studio.id);
    const ids = (people ?? []).map((p) => p.id as string);
    if (!ids.length) return result;

    const { data: rows } = await db
      .from("bookings")
      .select("id, title, starts_at, cancelled_at, category, contacts(*)")
      .in("artist_id", ids)
      .gte("starts_at", from)
      .lte("starts_at", to)
      .limit(500);

    const bookings: PastBooking[] = (rows ?? [])
      .filter((r) => r.contacts)
      .map((r) => ({
        id: r.id as string,
        title: r.title as string | null,
        starts_at: r.starts_at as string,
        cancelled_at: r.cancelled_at as string | null,
        category: r.category as string | null,
        contact: r.contacts as unknown as PastBooking["contact"],
      }));

    if (!bookings.length) return result;

    const due = dueNow(business, campaigns as unknown as Campaign[], bookings, new Set(), now);
    if (!due.length) return result;

    const smsFrom = await smsNumberFor(db, studio.id);
    const photoUrl = avatarUrl((studio as unknown as { photo_path?: string | null }).photo_path);

    for (const one of due) {
      /*
       * Claimed first, then sent. The unique index is what stops a second
       * sweep sending the same offer, and doing it the other way round means
       * every overlapping run writes to the same person again.
       */
      const { error: taken } = await db
        .from("handled_messages")
        /* studio_id so the send can be counted; dedupe is still message_id. */
        .insert({ message_id: one.key, channel: one.campaign.channel, studio_id: studio.id });

      if (taken) {
        /* 23505 is somebody else having it. Anything else is worth saying. */
        if (taken.code !== "23505") {
          console.error("[campaigns] could not claim", one.key, taken.message);
        }
        result.skipped++;
        continue;
      }

      const body = renderReminder(one.campaign.body, {
        name: one.booking.contact.name,
        business: studio.name,
        when: "",
        practitioner: "",
        link: "",
      });

      try {
        if (one.campaign.channel === "email") {
          if (!emailConfigured() || !one.booking.contact.email) {
            result.skipped++;
            continue;
          }

          const sent = await sendEmail({
            to: one.booking.contact.email,
            subject: one.campaign.name,
            text: body,
            html: buildEmail({ business: studio.name, body, photoUrl }),
            fromName: studio.name,
            replyTo: studio.email ?? undefined,
          });

          if (sent.status === "sent" || sent.status === "delivered") result.sent++;
          else result.failed++;
          continue;
        }

        /* Texts. Cost money, so the checks are the same ones and then some. */
        if (!smsConfigured() || !smsFrom || !one.booking.contact.phone) {
          result.skipped++;
          continue;
        }

        /*
         * STOP means stop, and it means it here more than anywhere.
         * A reminder is a service message somebody asked for by booking; an
         * offer is not, and sending one to a number that has opted out is the
         * thing regulators actually act on.
         */
        if (await isOptedOut(db, studio.id, one.booking.contact.phone)) {
          result.skipped++;
          continue;
        }

        const sent = await sendSms({
          to: one.booking.contact.phone,
          body: forOneText(body),
          from: smsFrom,
        });

        if (sent.status === "sent" || sent.status === "delivered") result.sent++;
        else result.failed++;
      } catch (e) {
        console.error("[campaigns] send threw", (e as Error)?.message);
        result.failed++;
      }
    }
  } catch (e) {
    /* This must never be the reason a reminder did not go out. */
    console.error("[campaigns]", (e as Error)?.message);
  }

  return result;
}
