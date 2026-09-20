import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Whether this client record exists for one thread and nothing else.
 *
 * The question behind taking somebody off the client list. Another conversation,
 * an appointment, a payment or a signed form all mean this is a real client who
 * happened to have one thread thrown away or filed, and the record stays.
 *
 * Written down once because two places ask it and they were about to disagree.
 * Deleting a thread asks it after the thread is gone; marking one as spam asks
 * it while the thread is still there, so that one has to leave itself out of the
 * count or the answer is always no.
 *
 * Errs towards keeping the record. A failed count comes back as a number we
 * cannot trust, and the wrong way to be wrong here is deleting a real client's
 * history because a query blipped.
 */
export async function nothingElseOfTheirs(
  db: SupabaseClient,
  contactId: string,
  /** A thread to ignore, when it is the one being filed and still exists. */
  exceptConversation?: string,
): Promise<boolean> {
  const threads = db
    .from("conversations")
    .select("id", { count: "exact", head: true })
    .eq("contact_id", contactId);

  const [{ count: otherThreads, error: threadsFailed }, bookings, payments, forms] =
    await Promise.all([
      exceptConversation ? threads.neq("id", exceptConversation) : threads,
      db.from("bookings").select("id", { count: "exact", head: true }).eq("contact_id", contactId),
      db.from("payments").select("id", { count: "exact", head: true }).eq("contact_id", contactId),
      db.from("client_forms").select("id", { count: "exact", head: true }).eq("contact_id", contactId),
    ]);

  if (threadsFailed || bookings.error || payments.error || forms.error) return false;

  return !otherThreads && !bookings.count && !payments.count && !forms.count;
}
