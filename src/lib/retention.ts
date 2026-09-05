import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Forgetting enquiries that went nowhere.
 *
 * Nothing was ever deleted, which is not a retention period — it is the
 * absence of one. Somebody who asked the price of a haircut two years ago and
 * never came back has their name, number and whole conversation sitting in a
 * database, and no business could justify why.
 *
 * Only conversations that never became a booking. One attached to work
 * actually done is part of the business's own record — of a day it worked, of
 * money it took — and deleting that would put holes in a diary and change last
 * year's takings. What goes is the enquiry nobody acted on.
 *
 * A contact goes only when nothing of theirs is left. Somebody who enquired
 * twice, booked once and drifted away is still a client of that business.
 */
export async function forgetOldEnquiries(
  db: SupabaseClient,
  studio: { id: string; keep_months: number | null },
  now = new Date(),
): Promise<{ conversations: number; contacts: number; error?: string }> {
  if (!studio.keep_months) return { conversations: 0, contacts: 0 };

  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - studio.keep_months);

  const { data: old, error: readError } = await db
    .from("conversations")
    .select("id, contact_id")
    .eq("studio_id", studio.id)
    .lt("created_at", cutoff.toISOString());

  /*
   * A read that failed is not an empty result.
   *
   * Carrying on here would report a clean sweep having deleted nothing, and
   * the next run would report the same — a retention policy that quietly does
   * not run is worse than none, because it is written down as done.
   */
  if (readError) return { conversations: 0, contacts: 0, error: readError.message };
  if (!old?.length) return { conversations: 0, contacts: 0 };

  const ids = old.map((c) => c.id);

  // Which of those ever became a booking. Those stay, whole.
  const { data: enquiries, error: enqError } = await db
    .from("enquiries")
    .select("id, conversation_id")
    .in("conversation_id", ids);
  if (enqError) return { conversations: 0, contacts: 0, error: enqError.message };

  const enquiryIds = (enquiries ?? []).map((e) => e.id);
  const { data: booked, error: bookError } = enquiryIds.length
    ? await db.from("bookings").select("enquiry_id").in("enquiry_id", enquiryIds)
    : { data: [], error: null };
  if (bookError) return { conversations: 0, contacts: 0, error: bookError.message };

  const bookedEnquiries = new Set((booked ?? []).map((b) => b.enquiry_id));
  const keep = new Set(
    (enquiries ?? [])
      .filter((e) => bookedEnquiries.has(e.id))
      .map((e) => e.conversation_id),
  );

  const going = old.filter((c) => !keep.has(c.id));
  if (!going.length) return { conversations: 0, contacts: 0 };

  const goingIds = going.map((c) => c.id);
  const goingEnquiries = (enquiries ?? [])
    .filter((e) => goingIds.includes(e.conversation_id))
    .map((e) => e.id);

  // Children first, or the foreign keys refuse.
  await db.from("messages").delete().in("conversation_id", goingIds);
  if (goingEnquiries.length) await db.from("enquiries").delete().in("id", goingEnquiries);
  const { error: convError } = await db.from("conversations").delete().in("id", goingIds);
  if (convError) return { conversations: 0, contacts: 0, error: convError.message };

  /*
   * And the people, only where nothing of theirs remains.
   *
   * Checked one at a time rather than assumed: somebody who enquired twice and
   * booked once still has a conversation and a booking, and is plainly still a
   * client of that business.
   */
  let contacts = 0;
  for (const contactId of new Set(going.map((c) => c.contact_id).filter(Boolean))) {
    const [{ count: stillTalking }, { count: stillBooked }] = await Promise.all([
      db.from("conversations").select("*", { count: "exact", head: true }).eq("contact_id", contactId),
      db.from("bookings").select("*", { count: "exact", head: true }).eq("contact_id", contactId),
    ]);
    if ((stillTalking ?? 1) === 0 && (stillBooked ?? 1) === 0) {
      await db.from("contacts").delete().eq("id", contactId).eq("studio_id", studio.id);
      contacts++;
    }
  }

  return { conversations: going.length, contacts };
}
