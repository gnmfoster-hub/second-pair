import type { SupabaseClient } from "@supabase/supabase-js";
import type { Channel } from "@/lib/types";

/**
 * Getting a message to a customer.
 *
 * One function per channel behind one call, so everything that wants to reach
 * somebody — a reply, an offer of a cancelled slot, a reminder — goes through
 * the same place and gets the same honesty about whether it arrived.
 *
 * Nothing here pretends. A channel that is not connected returns `failed` with
 * a reason a human can read, rather than reporting success and going nowhere,
 * which is how an owner ends up thinking they have replied when they have not.
 */

export type DeliveryStatus =
  | "not_needed"
  | "queued"
  | "sent"
  | "delivered"
  | "failed"
  | "outside_window";

export type Delivery = {
  status: DeliveryStatus;
  /** Shown to the owner when something did not go. Plain English. */
  error?: string;
  /** The platform's own id, for chasing a delivery report later. */
  externalId?: string;
};

/**
 * WhatsApp and Messenger only allow a free-form message within 24 hours of the
 * customer's last one. Outside that, Meta requires a template it has approved
 * in advance — a platform rule, not ours, and one that cannot be coded around.
 *
 * Instagram is the same 24 hours, with no template escape at all.
 */
const WINDOW_HOURS = 24;

const NEEDS_WINDOW: Channel[] = ["whatsapp", "messenger", "instagram"];

export function withinWindow(lastInboundAt: string | null | undefined): boolean {
  if (!lastInboundAt) return false;
  return Date.now() - Date.parse(lastInboundAt) < WINDOW_HOURS * 3600_000;
}

/** Whether this channel can be used to start a conversation at all. */
export function canOpenConversation(channel: Channel): boolean {
  return channel === "sms" || channel === "web";
}

export async function deliver({
  channel,
  to,
  body,
  lastInboundAt,
}: {
  channel: Channel;
  /** Phone number, page-scoped id, or the widget session — whatever the channel addresses. */
  to: string | null;
  body: string;
  /** When the customer last messaged, which decides the 24-hour window. */
  lastInboundAt?: string | null;
}): Promise<Delivery> {
  if (!body.trim()) return { status: "failed", error: "Nothing to send." };

  // The widget is a special case and the reason this returns a status rather
  // than a boolean: there is nothing to deliver. The customer reads it in the
  // chat window, which is already showing it.
  if (channel === "web") return { status: "not_needed" };

  if (!to) {
    return {
      status: "failed",
      error: "No address for this channel — there is nothing to send it to.",
    };
  }

  if (NEEDS_WINDOW.includes(channel) && !withinWindow(lastInboundAt)) {
    return {
      status: "outside_window",
      error:
        channel === "instagram"
          ? "Instagram only allows a reply within 24 hours of their last message. They will have to message again first."
          : "Meta only allows a free reply within 24 hours. After that it has to be one of their approved templates.",
    };
  }

  switch (channel) {
    case "whatsapp":
    case "messenger":
    case "instagram":
      return notConnected("Meta", "the app has not been through review yet");

    case "sms":
      return notConnected("text messages", "no SMS number is connected yet");

    case "voice":
      return { status: "failed", error: "You cannot send a message down a phone call." };

    default:
      return { status: "failed", error: "That channel is not one we send on." };
  }
}

/**
 * A channel that will exist but does not yet.
 *
 * Deliberately a failure rather than a queue: queuing implies it will go on
 * its own later, and a message sitting in a queue nobody is draining is a
 * customer nobody answered.
 */
function notConnected(what: string, why: string): Delivery {
  return {
    status: "failed",
    error: `Not connected: ${why}. Your reply is saved here but ${what} has not received it.`,
  };
}

/** Records what happened, so the thread shows the truth rather than a hope. */
export async function recordDelivery(
  db: SupabaseClient,
  messageId: string,
  result: Delivery,
): Promise<void> {
  await db
    .from("messages")
    .update({
      delivery: result.status,
      delivered_at:
        result.status === "sent" || result.status === "delivered"
          ? new Date().toISOString()
          : null,
      delivery_error: result.error ?? null,
      external_id: result.externalId ?? null,
    })
    .eq("id", messageId);
}
