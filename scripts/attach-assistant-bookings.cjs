/*
 * Attach every assistant booking to the client it was for.
 *
 *   node scripts/attach-assistant-bookings.cjs            look, change nothing
 *   node scripts/attach-assistant-bookings.cjs --write    put them right
 *
 * Giles, 12 October: "bookings by the assistant that doesn't show in the
 * bookings value and count."
 *
 * The cause is one missing line in lib/booking/index.ts, fixed alongside this:
 * the insert every assistant booking went through never wrote contact_id. The
 * client record finds a person's appointments by that column, so a customer
 * the assistant booked had a contact row with their name and number, a
 * conversation that knew exactly who they were, and a booking attached to
 * nobody. Their own record showed no appointments and nothing owed.
 *
 * It is the sibling of a fault already fixed in that same function: price_pence
 * was never written either, and was found the same way, by adding a live
 * client's money up by hand.
 *
 * This repairs what is already in the database, for every business rather than
 * the one it was noticed on.
 *
 * The owner is read through the enquiry, which is the only link a detached
 * booking still has: booking -> enquiry -> conversation -> contact. A booking
 * whose chain is broken anywhere is listed and left alone rather than guessed
 * at, because attaching an appointment to the wrong customer is worse than
 * leaving it attached to none.
 */
require("./pw/look.cjs");
const { createClient } = require("@supabase/supabase-js");

const write = process.argv.includes("--write");

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

(async () => {
  /* Every booking that is attached to nobody but came from an enquiry. */
  const { data: loose, error } = await db
    .from("bookings")
    .select("id, enquiry_id, starts_at, source, price_pence, cancelled_at")
    .is("contact_id", null)
    .not("enquiry_id", "is", null)
    .order("starts_at");

  if (error) {
    console.log(`  FAULT could not read the bookings: ${error.message}`);
    process.exit(1);
  }

  console.log(`\n${loose.length} bookings are attached to nobody and came from an enquiry.\n`);
  if (!loose.length) {
    console.log("  Nothing to do.\n");
    return;
  }

  /*
   * The chain, one booking at a time rather than one big join.
   *
   * Slower, and it is a few dozen rows. It also means a single broken link
   * reports that one booking instead of taking the whole query down with it,
   * which is what a join through four tables does when one of them says no.
   */
  const fixable = [];
  const stuck = [];

  for (const b of loose) {
    const { data: enq } = await db
      .from("enquiries")
      .select("id, conversation_id")
      .eq("id", b.enquiry_id)
      .maybeSingle();

    if (!enq?.conversation_id) {
      stuck.push([b, "the enquiry has no conversation"]);
      continue;
    }

    const { data: conv } = await db
      .from("conversations")
      .select("id, contact_id, studio_id, is_test")
      .eq("id", enq.conversation_id)
      .maybeSingle();

    if (!conv?.contact_id) {
      stuck.push([b, "the conversation has no contact"]);
      continue;
    }

    const { data: who } = await db
      .from("contacts")
      .select("id, name, phone, email, studio_id")
      .eq("id", conv.contact_id)
      .maybeSingle();

    if (!who) {
      stuck.push([b, "the contact row has gone"]);
      continue;
    }

    /*
     * The contact and the conversation must belong to the same business.
     *
     * Paranoid, and this is the one job where being wrong writes a real
     * customer's name onto a different company's appointment.
     */
    if (who.studio_id !== conv.studio_id) {
      stuck.push([b, "the contact belongs to a different business"]);
      continue;
    }

    fixable.push({ booking: b, contact: who, studioId: conv.studio_id });
  }

  /* Grouped by business, because that is how it will be checked afterwards. */
  const { data: studios } = await db.from("studios").select("id, name");
  const nameOf = new Map((studios ?? []).map((s) => [s.id, s.name]));

  const byStudio = new Map();
  for (const f of fixable) {
    if (!byStudio.has(f.studioId)) byStudio.set(f.studioId, []);
    byStudio.get(f.studioId).push(f);
  }

  for (const [studioId, rows] of byStudio) {
    console.log(`  ${nameOf.get(studioId) ?? studioId}  (${rows.length})`);
    for (const r of rows) {
      const money = r.booking.price_pence == null ? "no price" : `£${r.booking.price_pence / 100}`;
      const gone = r.booking.cancelled_at ? " cancelled" : "";
      console.log(
        `     ${r.booking.starts_at.slice(0, 10)}  ${String(r.booking.source).padEnd(10)}` +
          ` ${money.padEnd(9)} -> ${r.contact.name ?? "(no name)"}` +
          ` ${r.contact.phone ?? r.contact.email ?? ""}${gone}`,
      );
    }
    console.log("");
  }

  if (stuck.length) {
    console.log(`  Left alone, because the chain is broken (${stuck.length}):`);
    for (const [b, why] of stuck) {
      console.log(`     ${b.starts_at.slice(0, 10)}  ${b.source}  ${why}`);
    }
    console.log("");
  }

  if (!write) {
    console.log(`  Nothing written. Run with --write to attach them.\n`);
    return;
  }

  let done = 0;
  for (const f of fixable) {
    const { error: wrote } = await db
      .from("bookings")
      .update({ contact_id: f.contact.id })
      .eq("id", f.booking.id)
      /* Only if it is still attached to nobody, so a rerun cannot overwrite. */
      .is("contact_id", null);

    if (wrote) console.log(`  FAULT ${f.booking.id}: ${wrote.message}`);
    else done++;
  }

  console.log(`\n  ${done} of ${fixable.length} attached.\n`);
  process.exit(done === fixable.length ? 0 : 1);
})();
