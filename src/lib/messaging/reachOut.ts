import type { SupabaseClient } from "@supabase/supabase-js";
import { deliver, recordDelivery, type Delivery } from "@/lib/messaging/deliver";
import { routesFor } from "@/lib/messaging/reach";
import { smsNumberFor, connectedChannels } from "@/lib/messaging/connections";
import { replyToFor } from "@/lib/messaging/replyTo";
import type { Studio } from "@/lib/types";

/**
 * The business writing to a customer first, from a scheduled job.
 *
 * Review asks and "your MOT runs out next month" both used to call deliver()
 * on their own, which sends the text and then forgets it. Three things were
 * wrong with that, and they get worse in that order:
 *
 * The month's figures did not count it, so a text we pay Twilio for was never
 * on anybody's bill. The owner had no record of it, so a customer ringing up
 * about "that message you sent" was talking about something nobody could see.
 * And worst, the reply had nowhere to land: somebody answering "yes please,
 * book me in" started a brand new conversation, and the assistant met them
 * cold — no idea it had written to them an hour earlier or what about.
 *
 * So everything the business sends now goes through here: a thread to hang it
 * on, the message written down, then delivered, then the outcome recorded
 * against it. The same shape as messaging somebody from their own page.
 */
export async function reachOut({
  db,
  studio,
  contact,
  body,
  subject,
  transactional = false,
}: {
  db: SupabaseClient;
  studio: Studio;
  contact: { id: string; name?: string | null; phone?: string | null; email?: string | null };
  body: string;
  /** Email only. Ignored on a text. */
  subject?: string;
  /**
   * Whether this is a service message rather than a favour.
   *
   * False for anything the customer could reasonably not want, which is both
   * of the jobs using this: a review ask and a date falling due. deliver()
   * turns that into honouring STOP.
   */
  transactional?: boolean;
}): Promise<{ status: Delivery["status"] | "no_route"; conversationId?: string }> {
  /*
   * Their existing threads, so a reply lands where the history is.
   *
   * These jobs used to pass no conversations at all, on the grounds that a
   * review ask is not a reply to anything. True, and it still threw away the
   * one thing that makes the answer useful. A shut Meta window simply is not
   * an open route, which the picking below already handles.
   */
  const { data: threads } = await db
    .from("conversations")
    .select("id, channel, external_ref, last_inbound_at")
    .eq("contact_id", contact.id)
    .eq("studio_id", studio.id);

  const route = routesFor({
    conversations: (threads ?? []) as never,
    phone: contact.phone ?? null,
    email: contact.email ?? null,
    connected: await connectedChannels(db, studio.id),
  }).find((r) => r.open);

  if (!route?.to) return { status: "no_route" };

  let conversationId = route.conversationId;
  if (!conversationId) {
    const { data: made, error } = await db
      .from("conversations")
      .insert({
        studio_id: studio.id,
        contact_id: contact.id,
        channel: route.channel,
        external_ref: route.to,
        status: "new",
        outbound: true,
      })
      .select("id")
      .single();
    if (error) return { status: "no_route" };
    conversationId = made.id;
  }

  /*
   * Written down before it is sent, not after.
   *
   * If the send throws, the business still has a record that it tried, marked
   * with why it failed. The other way round loses the message entirely on the
   * one occasion anybody wants to read it.
   */
  const { data: message } = await db
    .from("messages")
    .insert({ conversation_id: conversationId, role: "owner", content: body })
    .select("id")
    .single();

  const result = await deliver({
    channel: route.channel,
    to: route.to,
    body,
    from: route.channel === "sms" ? await smsNumberFor(db, studio.id) : undefined,
    subject,
    fromName: studio.name,
    replyTo: replyToFor(studio),
    lastInboundAt: route.lastInboundAt ?? undefined,
    db,
    studioId: studio.id,
    transactional,
  });

  if (message?.id) await recordDelivery(db, message.id as string, result);

  return { status: result.status, conversationId: conversationId ?? undefined };
}
