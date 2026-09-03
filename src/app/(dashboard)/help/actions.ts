"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireStudio } from "@/lib/studio";

export type FormState = { ok?: true; error?: string };

/**
 * Asking for help, in writing, from inside the business.
 *
 * This exists so that supporting somebody does not mean going into their
 * account and reading their customers' conversations. They say what is wrong in
 * their own words; the answer comes back to the same place. Nobody has to look
 * at anything they were promised nobody would look at.
 *
 * It also leaves a record where they can find it. A phone call does not, and
 * "what did we agree about the deposits" deserves an answer six months later.
 */
export async function raiseTicket(_prev: FormState, fd: FormData): Promise<FormState> {
  const { studio, userId } = await requireStudio();
  const supabase = await createClient();

  const subject = String(fd.get("subject") ?? "").trim();
  const body = String(fd.get("body") ?? "").trim();

  if (!subject) return { error: "What is it about?" };
  if (!body) return { error: "Say what is happening and we will pick it up." };

  const { data: ticket, error } = await supabase
    .from("support_tickets")
    .insert({ studio_id: studio.id, opened_by: userId, subject })
    .select("id")
    .single();

  if (error) return { error: error.message };

  const { error: messageError } = await supabase
    .from("support_messages")
    .insert({ ticket_id: ticket.id, author: "owner", body });

  /*
   * A subject with no message is not a question anybody can answer.
   *
   * Rather than leave a half-written ticket sitting in a queue looking like
   * work, the ticket goes with it and they are told to try again.
   */
  if (messageError) {
    await supabase.from("support_tickets").delete().eq("id", ticket.id);
    return { error: messageError.message };
  }

  revalidatePath("/help");
  return { ok: true };
}

/** Adding to a thread that is already open — a reply, or something remembered. */
export async function replyToTicket(_prev: FormState, fd: FormData): Promise<FormState> {
  const { studio } = await requireStudio();
  const supabase = await createClient();

  const id = String(fd.get("ticket_id") ?? "");
  const body = String(fd.get("body") ?? "").trim();
  if (!body) return { error: "Nothing to send." };

  // Row-level security already limits this to their own studio; the filter is
  // here so a wrong id fails as "not found" rather than silently doing nothing.
  const { data: ticket } = await supabase
    .from("support_tickets")
    .select("id")
    .eq("id", id)
    .eq("studio_id", studio.id)
    .maybeSingle();

  if (!ticket) return { error: "That request no longer exists." };

  const { error } = await supabase
    .from("support_messages")
    .insert({ ticket_id: id, author: "owner", body });

  if (error) return { error: error.message };

  /*
   * Answering reopens it.
   *
   * A closed thread that somebody has replied to is not closed — they have
   * more to say, and it should be back in front of whoever is helping rather
   * than sitting under an archive nobody reads.
   */
  await supabase
    .from("support_tickets")
    .update({ status: "open", updated_at: new Date().toISOString(), closed_at: null })
    .eq("id", id);

  revalidatePath("/help");
  return { ok: true };
}
