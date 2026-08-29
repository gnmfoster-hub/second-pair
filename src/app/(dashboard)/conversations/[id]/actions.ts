"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireStudio } from "@/lib/studio";
import type { ConvStatus } from "@/lib/types";

export type ReplyState = { error?: string; ok?: boolean };

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

  // RLS would block a foreign id, but failing here gives a better message.
  const { data: conversation } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", id)
    .eq("studio_id", studio.id)
    .maybeSingle();
  if (!conversation) return { error: "Conversation not found." };

  const { error } = await supabase.from("messages").insert({
    conversation_id: id,
    role: "owner",
    content: text,
  });
  if (error) return { error: error.message };

  await supabase
    .from("conversations")
    .update({ ai_paused: true, last_message_at: new Date().toISOString() })
    .eq("id", id);

  revalidatePath(`/conversations/${id}`);
  revalidatePath("/");
  return { ok: true };
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
