import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";

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
};

export async function notifyStudio(
  db: SupabaseClient,
  studioId: string,
  message: Notification,
): Promise<{ sent: number; removed: number }> {
  if (!ready()) return { sent: 0, removed: 0 };

  const { data: subscriptions } = await db
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("studio_id", studioId);

  if (!subscriptions?.length) return { sent: 0, removed: 0 };

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

  return { sent, removed: dead.length };
}
