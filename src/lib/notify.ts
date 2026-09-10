import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail, emailConfigured } from "@/lib/messaging/email";
import { gatherBookingAlert } from "@/lib/messaging/bookingAlert";

/**
 * Telling the owner something needs them.
 *
 * One function, deliberately, so that adding email or SMS later is a change in
 * here and nowhere else. Everything that wants to reach a business calls
 * `notifyStudio` and does not care how it arrives.
 *
 * Never throws. A notification failing must not take down the thing that
 * caused it — an escalation that reached nobody is bad, an escalation that
 * also broke the reply is worse.
 */

let configured = false;

function ready(): boolean {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;

  if (!configured) {
    webpush.setVapidDetails(
      // A domain we actually own. secondpair.co.uk was never registered, and a
      // push service that cannot reach the sender at the address it was given
      // is entitled to stop delivering.
      process.env.VAPID_SUBJECT || "mailto:info@second-pair.com",
      publicKey,
      privateKey,
    );
    configured = true;
  }
  return true;
}

export type Notification = {
  title: string;
  body: string;
  /** Where tapping it should land. Relative to the app. */
  url?: string;
  /** Replaces an earlier notification with the same tag rather than stacking. */
  tag?: string;
  /**
   * Also send it to the business's own inbox.
   *
   * Written separately rather than reusing the push wording, because the two
   * are read in different places. A lock screen is read by whoever happens to
   * be stood next to them, so the push says little; an inbox is theirs, so the
   * email can carry the customer's name and number and save them a trip to
   * the dashboard.
   *
   * Left out for anything time-critical. A five-minute hold on a conversation
   * is over before an email is read, and an inbox filling with expired
   * urgencies is how people learn to ignore the whole sender.
   */
  email?: { subject: string; text: string };
};

export async function notifyStudio(
  db: SupabaseClient,
  studioId: string,
  message: Notification,
): Promise<{ sent: number; removed: number; emailed: boolean }> {
  /*
   * The email goes first, and it goes whatever push does.
   *
   * Push reaches nobody until somebody has pressed a button on the device they
   * want buzzed, and — checked on the live database — not one business has
   * ever pressed it. So every notification this product has ever sent has gone
   * precisely nowhere, including the escalation, which the code calls the one
   * moment the owner genuinely has to be interrupted.
   *
   * An address, they have. Sending both is not belt and braces here; the email
   * is the one that arrives.
   */
  const emailed = await emailStudio(db, studioId, message.email);

  if (!ready()) return { sent: 0, removed: 0, emailed };

  const { data: subscriptions } = await db
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("studio_id", studioId);

  if (!subscriptions?.length) return { sent: 0, removed: 0, emailed };

  const payload = JSON.stringify({
    title: message.title,
    body: message.body,
    url: message.url ?? "/",
    tag: message.tag,
  });

  let sent = 0;
  const dead: string[] = [];

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payload,
          { TTL: 3600 },
        );
        sent += 1;
      } catch (error) {
        // 404 and 410 mean the browser threw the subscription away — the app
        // was uninstalled, or permission was revoked. Keeping it would mean
        // retrying a dead endpoint forever.
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) dead.push(sub.id);
        else console.error("[push]", status, (error as Error).message);
      }
    }),
  );

  if (dead.length) {
    await db.from("push_subscriptions").delete().in("id", dead);
  }

  if (sent) {
    await db
      .from("push_subscriptions")
      .update({ last_used_at: new Date().toISOString() })
      .eq("studio_id", studioId);
  }

  return { sent, removed: dead.length, emailed };
}

/**
 * The same news, in their inbox.
 *
 * Never throws, for the same reason nothing else in here does: this is called
 * from the middle of answering a customer, and an alert that could not be sent
 * must not become a reply that was not sent.
 */
async function emailStudio(
  db: SupabaseClient,
  studioId: string,
  email: Notification["email"],
): Promise<boolean> {
  if (!email || !emailConfigured()) return false;

  try {
    const { data: studio } = await db
      .from("studios")
      .select("name, email")
      .eq("id", studioId)
      .maybeSingle();

    // No address on file is not a failure. It is a setting nobody has filled
    // in, and the settings page is where that gets said, not here.
    if (!studio?.email) return false;

    const result = await sendEmail({
      to: studio.email,
      subject: email.subject,
      text: email.text,
      // From us, not from them. It is our software telling them something
      // happened, and a business emailing itself lands in its own spam.
      fromName: "Second Pair",
    });

    if (result.status !== "sent") {
      console.error("[notify:email]", studio.email, result.error);
      return false;
    }
    return true;
  } catch (error) {
    console.error("[notify:email]", (error as Error).message);
    return false;
  }
}

/**
 * Somebody has just been put in the diary.
 *
 * Called at the moment a booking becomes real — either straight away, or when
 * a deposit lands on one that was only being held. Never at the point of the
 * hold: a slot held for an hour that nobody pays for is not a booking, and
 * telling a business about one twice is how a useful alert becomes noise.
 *
 * Never throws. The booking is already saved by the time this runs.
 */
export async function alertNewBooking(
  db: SupabaseClient,
  bookingId: string,
): Promise<void> {
  try {
    const alert = await gatherBookingAlert(db, bookingId, siteUrl());
    if (!alert) return;

    await notifyStudio(db, alert.studioId, {
      title: alert.title,
      body: alert.body,
      url: `/conversations/${alert.conversationId}`,
      // One per booking. A retry, or a deposit landing on a booking already
      // announced, replaces the notification rather than adding to it.
      tag: `booking-${bookingId}`,
      email: { subject: alert.emailSubject, text: alert.emailText },
    });
  } catch (error) {
    console.error("[notify:booking]", (error as Error).message);
  }
}

/**
 * Where the dashboard lives, for a link in an email.
 *
 * An email is read away from the app, so a relative path is no use in one —
 * and this is the only place in the codebase that needs the absolute address,
 * which is why there is no shared helper to reach for.
 */
function siteUrl(): string {
  const set = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");
  return set || "https://www.second-pair.com";
}
