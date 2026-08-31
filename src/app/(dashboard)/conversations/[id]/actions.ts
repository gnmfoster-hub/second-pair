"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { deliver, recordDelivery } from "@/lib/messaging/deliver";
import type { Channel } from "@/lib/types";
import { requireStudio } from "@/lib/studio";
import type { ConvStatus } from "@/lib/types";

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
    .select("id, channel, external_ref, contacts(phone)")
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
  const { data: lastInbound } = await supabase
    .from("messages")
    .select("created_at")
    .eq("conversation_id", id)
    .eq("role", "client")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const contact = conversation.contacts as unknown as { phone: string | null } | null;

  const result = await deliver({
    channel: conversation.channel as Channel,
    to: conversation.channel === "sms" ? contact?.phone ?? null : conversation.external_ref,
    body: text,
    lastInboundAt: lastInbound?.created_at ?? null,
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

/**
 * Whether the person signed in may message customers.
 *
 * Owners always can. Staff can unless the owner has said otherwise — reading a
 * thread and writing in the business's voice are different things.
 */
async function canMessage(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data } = await supabase
    .from("studio_members")
    .select("role, can_message")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!data) return false;
  return data.role === "owner" || data.can_message !== false;
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
