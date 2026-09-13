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

  /*
   * How many are waiting, sent with the notification.
   *
   * The app icon can carry a number, and the only moment it can be updated
   * while the app is shut is when a push arrives — which is exactly when it
   * has changed. Without this the icon stays on whatever it said the last time
   * somebody opened the app, which is worse than no badge: a stale number is
   * still read as a current one.
   *
   * Studio-wide rather than per-person: a push goes to every device the
   * business has registered, and there is one icon on each.
   */
  const waiting = await countWaiting(db, studioId);

  const payload = JSON.stringify({
    title: message.title,
    body: message.body,
    url: message.url ?? "/",
    tag: message.tag,
    waiting,
  });

  const { sent, removed } = await pushTo(db, subscriptions, payload);
  return { sent, removed, emailed };
}

/** One device's worth of what the browser gave us. */
type Sub = { id: string; endpoint: string; p256dh: string; auth: string };

/**
 * Send to some devices and forget the ones that have gone.
 *
 * Pulled out of notifyStudio when notifying one person arrived: the two differ
 * only in which devices they reach, and duplicating the dead-endpoint handling
 * would have meant one of the two copies quietly keeping subscriptions alive
 * forever after somebody uninstalled the app.
 */
async function pushTo(
  db: SupabaseClient,
  subscriptions: Sub[],
  payload: string,
): Promise<{ sent: number; removed: number }> {
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
    /*
     * Only the ones just used. This updated every device the business had,
     * which made "last used" mean "last time anybody was notified" rather than
     * "last time this phone was reached" — and that is the column somebody
     * looks at to work out which of two devices has stopped working.
     */
    await db
      .from("push_subscriptions")
      .update({ last_used_at: new Date().toISOString() })
      .in("id", subscriptions.filter((s) => !dead.includes(s.id)).map((s) => s.id));
  }

  return { sent, removed: dead.length };
}

/**
 * Conversations that need a person, for the number on the icon.
 *
 * Never throws and never blocks the notification: an icon without a number is
 * a small loss, and a notification that failed to send because of a count is a
 * customer nobody answered.
 */
async function countWaiting(db: SupabaseClient, studioId: string): Promise<number | null> {
  try {
    const { count, error } = await db
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("studio_id", studioId)
      .eq("is_test", false)
      .eq("status", "needs_human");

    return error ? null : count ?? null;
  } catch {
    return null;
  }
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
 * Telling one person, rather than the business.
 *
 * Everything else in here reaches the business: the email goes to the one
 * address on file and the push goes to every device anybody has registered
 * against it. That is right for an escalation — somebody has to answer it and
 * it does not much matter who — and wrong for "you have a booking at ten",
 * which is one person's business and nobody else's.
 *
 * Without this a stylist who subscribed her own phone would be buzzed about
 * everybody's work, which is how somebody turns notifications off for good.
 *
 * Never throws, like everything else here: this runs in the middle of putting
 * somebody in a diary, and a notification that could not be sent must not
 * become a booking that was not made.
 */
export async function notifyArtist(
  db: SupabaseClient,
  artistId: string,
  message: Notification,
): Promise<void> {
  try {
    const { data: artist } = await db
      .from("artists")
      .select("id, name, email, user_id, studio_id, notify_own_bookings")
      .eq("id", artistId)
      .maybeSingle();

    if (!artist) return;

    // A column that does not exist yet reads as undefined, and the default is
    // on — so this works before the migration runs as well as after.
    if (artist.notify_own_bookings === false) return;

    /*
     * Their own address, unless it is the business's.
     *
     * In a one-person business it always is: Karen is the only cleaner at Neat
     * & Tidy and info@ is both her address and the firm's. The business has
     * already been emailed by the time this runs, so sending again would mean
     * two identical emails for every booking — which is how somebody decides
     * the notifications are broken and stops reading them.
     *
     * Push does not need the same guard: the tag is the same on both, so the
     * second replaces the first rather than stacking.
     */
    if (artist.email && emailConfigured() && message.email) {
      const { data: studio } = await db
        .from("studios")
        .select("email")
        .eq("id", artist.studio_id)
        .maybeSingle();

      const same =
        studio?.email &&
        studio.email.trim().toLowerCase() === artist.email.trim().toLowerCase();

      if (!same) {
        await sendEmail({
          to: artist.email,
          subject: message.email.subject,
          text: message.email.text,
        });
      }
    }

    /*
     * Their devices, not the business's.
     *
     * A person without a login has no user_id and therefore no devices, which
     * is most of a salon — they still get the email if they have an address,
     * and that is the whole of what reaches them.
     */
    if (!artist.user_id || !ready()) return;

    const { data: subscriptions } = await db
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("studio_id", artist.studio_id)
      .eq("user_id", artist.user_id);

    if (!subscriptions?.length) return;

    await pushTo(
      db,
      subscriptions,
      JSON.stringify({
        title: message.title,
        body: message.body,
        url: message.url ?? "/",
        tag: message.tag,
        waiting: await countWaiting(db, artist.studio_id),
      }),
    );
  } catch (error) {
    console.error("[notify:artist]", (error as Error).message);
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

    const message = {
      title: alert.title,
      body: alert.body,
      url: `/conversations/${alert.conversationId}`,
      // One per booking. A retry, or a deposit landing on a booking already
      // announced, replaces the notification rather than adding to it.
      tag: `booking-${bookingId}`,
      email: { subject: alert.emailSubject, text: alert.emailText },
    };

    await notifyStudio(db, alert.studioId, message);

    /*
     * And the person whose diary it is.
     *
     * The business hearing about it is not the same as the stylist hearing
     * about it: the email goes to one address, usually the owner's, and the
     * push goes to devices that in practice belong to the owner too. Somebody
     * booked in with Jade at ten was, until now, news that reached everybody
     * except Jade.
     *
     * Awaited but harmless if it fails — notifyArtist never throws, and the
     * booking is already made by the time either of these runs.
     */
    if (alert.artistId) {
      await notifyArtist(db, alert.artistId, message);
    }
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
