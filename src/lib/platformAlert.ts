import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail, emailConfigured } from "./messaging/email.ts";
import { addressOf } from "./messaging/address.ts";

/**
 * Telling us — not the business — that something is broken for everybody.
 *
 * The businesses are told about their own conversations already. Nobody was
 * ever told when the fault was ours: the model account ran out of credit on
 * the afternoon of 16 September and every customer of every business got an
 * error for as long as it took a person to open the widget and look. The only
 * monitoring that existed was somebody running a script by hand.
 *
 * So the first customer to hit a broken assistant now sends one email here.
 * That is the right trigger: it fires within seconds of the first person being
 * affected, needs no scheduled job, and stays quiet when nothing is wrong.
 */

/**
 * One alert per problem per hour, whatever the traffic.
 *
 * During an outage every message fails, and a mailbox with four hundred copies
 * of the same sentence in it is not a warning, it is a wall. The key is the
 * problem and the hour, and the database's unique index does the rest — which
 * also means it holds across instances, where a counter in memory would not.
 */
export function alertKey(name: string, at: Date = new Date()): string {
  const hour = at.toISOString().slice(0, 13); // 2026-09-16T15
  return `alert:${name}:${hour}`;
}

/** Where a platform alert goes. Not a business's address — ours. */
export function alertAddress(): string | null {
  const explicit = process.env.PLATFORM_ALERT_EMAIL?.trim();
  if (explicit) return addressOf(explicit) || explicit;

  // The address we send from is one we read, which makes it the right
  // fallback: it is already set everywhere, and it is not a customer's.
  const from = process.env.EMAIL_FROM?.trim();
  return from ? addressOf(from) || null : null;
}

export async function alertPlatform(
  db: SupabaseClient,
  alert: { name: string; subject: string; text: string },
): Promise<{ sent: boolean; why?: string }> {
  try {
    const to = alertAddress();
    if (!to || !emailConfigured()) return { sent: false, why: "no address to send to" };

    /*
     * The claim goes first, and the email only if the claim is ours.
     *
     * Sending first and recording after would send a second copy for every
     * request handled in parallel — which during an outage is all of them.
     */
    const { error } = await db
      .from("handled_messages")
      .insert({ message_id: alertKey(alert.name), channel: "email" });

    if (error) return { sent: false, why: "already told this hour" };

    const result = await sendEmail({
      to,
      subject: alert.subject,
      text: alert.text,
      // Marked automatic, so nothing on the other end tries to answer it.
      automatic: true,
    });

    return { sent: result.status === "sent", why: result.error ?? undefined };
  } catch (e) {
    // This exists to report failures. It must never become one.
    console.error("[platformAlert]", (e as Error)?.message);
    return { sent: false, why: "could not send" };
  }
}
