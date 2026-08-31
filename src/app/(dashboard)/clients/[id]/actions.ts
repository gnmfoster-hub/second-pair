"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireStudio } from "@/lib/studio";
import { canMessage } from "@/lib/permissions";
import { deliver, recordDelivery } from "@/lib/messaging/deliver";
import { routesFor } from "@/lib/messaging/reach";
import { connectedChannels } from "@/lib/messaging/connections";
import type { Channel } from "@/lib/types";

export type ClientState = { error?: string; ok?: boolean };

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();

export async function saveClient(_prev: ClientState, fd: FormData): Promise<ClientState> {
  const { studio } = await requireStudio();
  const supabase = await createClient();

  const id = str(fd, "id");
  const { error } = await supabase
    .from("contacts")
    .update({
      name: str(fd, "name") || null,
      phone: str(fd, "phone") || null,
      email: str(fd, "email") || null,
      notes: str(fd, "notes") || null,
      alert: str(fd, "alert") || null,
      marketing_consent: fd.get("marketing_consent") === "on",
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
    lastInboundAt: route.lastInboundAt,
    /*
     * Email needs a subject and somebody to reply to.
     *
     * It goes out from our verified domain, so the business's name sits in the
     * display line and their own address in reply-to. Without that, a customer
     * answering writes to us and nobody at the salon ever sees it.
     */
    subject: `Message from ${studio.name}`,
    fromName: studio.name,
    replyTo: studio.email ?? undefined,
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
