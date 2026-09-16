"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { marketingPatch, canRecordEvidence } from "@/lib/consent";
import { hasColumn } from "@/lib/db/hasColumn";
import { requireStudio } from "@/lib/studio";
import { canMessage } from "@/lib/permissions";
import { deliver, recordDelivery } from "@/lib/messaging/deliver";
import { routesFor } from "@/lib/messaging/reach";
import { connectedChannels, smsNumberFor } from "@/lib/messaging/connections";
import type { Channel } from "@/lib/types";
import { replyToFor } from "@/lib/messaging/replyTo";
import { sendPaymentReceipt } from "@/lib/messaging/receipt";

export type ClientState = { error?: string; ok?: boolean };

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();

export async function saveClient(_prev: ClientState, fd: FormData): Promise<ClientState> {
  const { studio } = await requireStudio();
  const supabase = await createClient();

  const id = str(fd, "id");

  /*
   * What is already recorded, so agreeing again does not restamp it.
   *
   * Somebody editing a phone number on a record whose box was ticked two years
   * ago must not silently turn that into consent given today. select("*") so
   * this keeps working before the migration that adds the two columns.
   */
  const { data: before } = await supabase
    .from("contacts")
    .select("*")
    .eq("id", id)
    .eq("studio_id", studio.id)
    .maybeSingle();

  const { error } = await supabase
    .from("contacts")
    .update({
      name: str(fd, "name") || null,
      phone: str(fd, "phone") || null,
      email: str(fd, "email") || null,
      notes: str(fd, "notes") || null,
      alert: str(fd, "alert") || null,
      /*
       * Per channel, with the evidence beside it. The single tick is still
       * written underneath, so anything reading "may we market to them at all"
       * keeps working — including the export an owner takes to a mail service.
       */
      ...marketingPatch(
        {
          email: fd.get("marketing_email") === "on",
          sms: fd.get("marketing_sms") === "on",
        },
        before as {
          marketing_consent?: boolean;
          marketing_consent_at?: string | null;
          marketing_email?: boolean;
          marketing_sms?: boolean;
        } | null,
        "recorded by the business",
        (await canRecordEvidence(supabase)) && (await hasColumn(supabase, "contacts", "marketing_email")),
      ),
    })
    .eq("id", id)
    .eq("studio_id", studio.id);

  if (error) {
    return {
      error:
        error.code === "23505"
          ? "Somebody else already has that number or email."
          : error.message,
    };
  }

  revalidatePath(`/clients/${id}`);
  revalidatePath("/clients");
  return { ok: true };
}

/**
 * Messaging a customer from their own page.
 *
 * The same machinery as an in-thread reply, pointed the other way: the
 * business starting the conversation rather than answering one. A salon with a
 * cancellation at four o'clock wants to offer it to somebody, and that is this.
 *
 * The route is worked out again here rather than trusted from the browser.
 * What the page rendered may be minutes stale — a window closes on its own —
 * and a posted channel and address would otherwise be a way to send a message
 * anywhere, from any account, by editing a form.
 */
export type MessageState = {
  error?: string;
  ok?: boolean;
  /** Saved, but it did not reach them — and why. */
  warning?: string;
};

export async function messageClient(
  _prev: MessageState,
  fd: FormData,
): Promise<MessageState> {
  const { studio } = await requireStudio();
  const supabase = await createClient();

  const contactId = String(fd.get("contact_id") ?? "");
  const channel = String(fd.get("channel") ?? "") as Channel;
  const text = String(fd.get("message") ?? "").trim();

  if (!text) return { error: "Nothing to send." };
  if (!(await canMessage())) {
    return { error: "You do not have permission to message customers." };
  }

  const { data: contact } = await supabase
    .from("contacts")
    .select("id, name, phone, email, conversations(id, channel, external_ref, last_inbound_at)")
    .eq("id", contactId)
    .eq("studio_id", studio.id)
    .maybeSingle();
  if (!contact) return { error: "Client not found." };

  const routes = routesFor({
    conversations: (contact.conversations ?? []) as never,
    phone: contact.phone,
    email: contact.email,
    /* Which way they asked to be reached, where they have said. */
    prefers: (contact as { prefers?: string | null }).prefers as "sms" | "email" | null,
    connected: await connectedChannels(supabase, studio.id),
  });

  const route = routes.find((r) => r.channel === channel);
  if (!route) return { error: "There is no way to reach them on that." };
  if (!route.open) return { error: route.blocked ?? "That channel cannot be used right now." };

  /*
   * A thread to hang it on.
   *
   * Marked outbound, and deliberately left with the assistant running. An
   * offer of a cancelled slot is only worth making if the "yes please" that
   * comes back gets booked, and pausing the assistant here would leave that
   * reply sitting unread until somebody happened to look.
   */
  let conversationId = route.conversationId;
  if (!conversationId) {
    const { data: made, error } = await supabase
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
    if (error) return { error: error.message };
    conversationId = made.id;
  }

  const { data: message, error: writeError } = await supabase
    .from("messages")
    .insert({ conversation_id: conversationId, role: "owner", content: text })
    .select("id")
    .single();
  if (writeError) return { error: writeError.message };

  const result = await deliver({
    channel: route.channel,
    to: route.to,
    body: text,
    // The owner's own message. Not transactional: if they have said stop,
    // the business hears why rather than the customer hearing from them.
    db: supabase,
    studioId: studio.id,
    lastInboundAt: route.lastInboundAt,
    /*
     * Email needs a subject and somebody to reply to.
     *
     * It goes out from our verified domain, so the business's name sits in the
     * display line and their own address in reply-to. Without that, a customer
     * answering writes to us and nobody at the salon ever sees it.
     */
    from: route.channel === "sms" ? await smsNumberFor(supabase, studio.id) : undefined,
    subject: `Message from ${studio.name}`,
    fromName: studio.name,
    replyTo: replyToFor(studio),
  });
  if (message) await recordDelivery(supabase, message.id, result);

  await supabase
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conversationId);

  revalidatePath(`/clients/${contactId}`);
  revalidatePath("/");

  return result.error ? { ok: true, warning: result.error } : { ok: true };
}

/**
 * Send a receipt again.
 *
 * "I never got it" is the single most common thing anybody says about a
 * receipt, and until this the only answer a business had was to describe the
 * payment in a message typed by hand. The email goes automatically when the
 * money lands; it can land in spam, or go to an address they have since
 * changed, and a receipt nobody can re-send is half a feature.
 *
 * Deliberately no preview and no editing. It is a record of what happened, and
 * a receipt somebody can reword before sending is not a record.
 */
export async function resendReceipt(
  _prev: ClientState,
  fd: FormData,
): Promise<ClientState> {
  const { studio } = await requireStudio();
  const supabase = await createClient();

  const paymentId = str(fd, "payment_id");
  const contactId = str(fd, "contact_id");

  /*
   * Scoped to the business, and checked here rather than trusted from the
   * form. A payment id is a uuid in a hidden field, and "it would have to be
   * guessed" is not an access rule — RLS would refuse the read anyway, and
   * this turns that into a sentence rather than a blank screen.
   */
  const { data: payment } = await supabase
    .from("payments")
    .select("id, status")
    .eq("id", paymentId)
    .eq("studio_id", studio.id)
    .maybeSingle();

  if (!payment) return { error: "That payment is not on this account." };

  // A refunded payment is not a receipt anybody should be sending again: the
  // money went back, and a document saying they paid it would be wrong.
  if (payment.status !== "paid") {
    return { error: "That payment was refunded, so there is no receipt to send." };
  }

  const { data: contact } = await supabase
    .from("contacts")
    .select("email")
    .eq("id", contactId)
    .eq("studio_id", studio.id)
    .maybeSingle();

  if (!contact?.email) {
    return { error: "There is no email address on this client to send it to." };
  }

  await sendPaymentReceipt(supabase, paymentId);

  revalidatePath(`/clients/${contactId}`);
  return { ok: true };
}
