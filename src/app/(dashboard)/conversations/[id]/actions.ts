"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { deliver, recordDelivery } from "@/lib/messaging/deliver";
import type { Channel } from "@/lib/types";
import { requireStudio } from "@/lib/studio";
import { canMessage } from "@/lib/permissions";
import type { ConvStatus } from "@/lib/types";
import { replyToFor } from "@/lib/messaging/replyTo";
import { canRemove } from "@/lib/conversations/removable";

export type ReplyState = {
  error?: string;
  ok?: boolean;
  /** Saved, but it did not reach the customer — and why. */
  warning?: string;
};

/** Owner replies in-thread. Sending pauses the assistant on this conversation. */
export async function sendOwnerReply(
  _prev: ReplyState,
  fd: FormData,
): Promise<ReplyState> {
  const { studio } = await requireStudio();
  const supabase = await createClient();

  const id = String(fd.get("conversation_id") ?? "");
  const text = String(fd.get("message") ?? "").trim();
  if (!text) return { error: "Nothing to send." };

  // Sending in the business's name is the one thing here that reaches the
  // outside world, so it is the one thing an owner can withhold.
  if (!(await canMessage())) {
    return { error: "You do not have permission to message customers." };
  }

  // RLS would block a foreign id, but failing here gives a better message.
  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, channel, external_ref, last_inbound_at, contacts(phone, email)")
    .eq("id", id)
    .eq("studio_id", studio.id)
    .maybeSingle();
  if (!conversation) return { error: "Conversation not found." };

  const { data: message, error } = await supabase
    .from("messages")
    .insert({ conversation_id: id, role: "owner", content: text })
    .select("id")
    .single();
  if (error) return { error: error.message };

  /*
   * Saved, then delivered — and the difference recorded.
   *
   * A reply used to write a row and stop, which is fine for the widget where
   * the customer reads it in the chat itself, and silently useless on any
   * channel that has to hand it to a platform. The owner saw their reply in
   * the thread and had no idea it never left.
   */
  const contact = conversation.contacts as unknown as {
    phone: string | null;
    email: string | null;
  } | null;

  const result = await deliver({
    channel: conversation.channel as Channel,
    to: conversation.channel === "sms" ? contact?.phone ?? null : conversation.external_ref,
    body: text,
    lastInboundAt: conversation.last_inbound_at,
    /*
     * Where to find somebody who asked through the website.
     *
     * They are not sitting in the widget — they asked on a Tuesday evening and
     * closed the tab. Whatever the assistant collected while it was talking to
     * them is the only way back to them.
     */
    reachOn: { phone: contact?.phone ?? null, email: contact?.email ?? null },
    fromName: studio.name,
    replyTo: replyToFor(studio),
  });

  if (message) await recordDelivery(supabase, message.id, result);

  await supabase
    .from("conversations")
    .update({ ai_paused: true, last_message_at: new Date().toISOString() })
    .eq("id", id);

  revalidatePath(`/conversations/${id}`);
  revalidatePath("/");

  // Saved either way, but the owner is told plainly when it did not go.
  return result.error ? { ok: true, warning: result.error } : { ok: true };
}


export async function setPaused(fd: FormData) {
  const supabase = await createClient();
  const id = String(fd.get("conversation_id") ?? "");
  const paused = fd.get("paused") === "true";

  await supabase.from("conversations").update({ ai_paused: paused }).eq("id", id);

  revalidatePath(`/conversations/${id}`);
  revalidatePath("/");
}

export async function setStatus(fd: FormData) {
  const supabase = await createClient();
  const id = String(fd.get("conversation_id") ?? "");
  const status = String(fd.get("status") ?? "") as ConvStatus;

  await supabase.from("conversations").update({ status }).eq("id", id);

  revalidatePath(`/conversations/${id}`);
  revalidatePath("/");
}

export type RemoveState = { error?: string };

/**
 * Throw a conversation away.
 *
 * Not everything that arrives is an enquiry. A business gets spam, wrong
 * numbers, a supplier's newsletter forwarded by mistake, and its own testing —
 * and until now every one of those stayed in the inbox for good. There was no
 * way to remove a thread at all, which is a strange thing to say about an
 * inbox.
 *
 * Different from erasing a client, deliberately, and both are needed. Erasing
 * answers a person asking to be forgotten and keeps their appointments as
 * anonymous entries, because the business still worked that afternoon. This
 * one is for a thread that should never have been there, where there is
 * nothing worth keeping and no appointment behind it.
 */
export async function removeConversation(
  _prev: RemoveState,
  fd: FormData,
): Promise<RemoveState> {
  const { studio } = await requireStudio();
  const supabase = await createClient();

  const id = String(fd.get("id") ?? "");
  if (!id) return { error: "No conversation." };

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", id)
    .eq("studio_id", studio.id)
    .maybeSingle();

  if (!conversation) return { error: "That conversation is not here any more." };

  const { data: enquiries } = await supabase
    .from("enquiries")
    .select("id, reference_urls")
    .eq("conversation_id", id);

  const enquiryIds = (enquiries ?? []).map((e) => e.id);

  /*
   * What is hanging off it, before anything is removed.
   *
   * The whole chain cascades — conversation to enquiry to booking to reminder
   * — so deleting a thread with an appointment on it would take the appointment
   * out of the diary without a word. That is the exact fault the erasure flow
   * had, and it is not being written twice.
   */
  if (enquiryIds.length) {
    const { data: bookings } = await supabase
      .from("bookings")
      .select("starts_at, cancelled_at")
      .in("enquiry_id", enquiryIds);

    const verdict = canRemove(bookings ?? [], studio.timezone);
    if (!verdict.ok) return { error: verdict.because };
  }

  /*
   * One check is enough, and a second would have been worse than none.
   *
   * The first draft also looked for bookings by conversation_id. There is no
   * such column — enquiry_id is not null on every booking, so the enquiry is
   * the only way in — and asking for it does not return an empty list:
   * PostgREST refuses the whole query and hands back nothing, which reads
   * exactly like "no appointments here". A guard that silently answers "all
   * clear" is worse than no guard, because it is trusted.
   */

  /*
   * The photographs go first, and by hand.
   *
   * They are the only part of this that does not live in the database, so
   * nothing cascades them. Deleting the rows first would leave somebody's
   * pictures in our storage with nothing left pointing at them — which is
   * worse than not deleting at all, because now nobody knows they are there.
   */
  const files = (enquiries ?? []).flatMap((e) => (e.reference_urls as string[] | null) ?? []);
  if (files.length) await supabase.storage.from("references").remove(files);

  const { error } = await supabase
    .from("conversations")
    .delete()
    .eq("id", id)
    .eq("studio_id", studio.id);

  if (error) return { error: `Could not remove it: ${error.message}` };

  revalidatePath("/conversations");
  redirect("/conversations?removed=1");
}
