"use server";

import { revalidatePath } from "next/cache";
import { requireStudio, getArtists } from "@/lib/studio";
import { createClient } from "@/lib/supabase/server";
import { instantFrom } from "@/lib/booking/tz";
import { scheduleReminders } from "@/lib/reminders";

export type GroupState = { error?: string; ok?: boolean; made?: number; skipped?: string[] };

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();

/** One person in the party, as the form describes them. */
type Row = {
  who: string;
  /** Their existing record, where the search matched one. */
  contactId: string | null;
  artistId: string;
  time: string;
  minutes: number;
  price: string;
};

/**
 * Reads the rows out of the form.
 *
 * Indexed field names rather than a JSON blob, so the form works with
 * JavaScript off and a half-filled row is visible in the request rather than
 * hidden inside a string somebody has to parse to debug.
 *
 * A row with no name is not an error. Somebody adds three slots, fills two and
 * submits — that is a party of two, not a mistake to be told off about.
 */
function readRows(fd: FormData): Row[] {
  const rows: Row[] = [];
  for (let i = 0; i < 20; i++) {
    const who = str(fd, `who_${i}`);
    const artistId = str(fd, `artist_${i}`);
    if (!who || !artistId) continue;
    rows.push({
      who,
      contactId: str(fd, `contact_${i}`) || null,
      artistId,
      time: str(fd, `time_${i}`),
      minutes: Number(str(fd, `minutes_${i}`)) || 0,
      price: str(fd, `price_${i}`),
    });
  }
  return rows;
}

/**
 * A wedding party, a family, a house of four rooms: several appointments made
 * as one arrangement.
 *
 * Each row becomes an ordinary booking. That is the whole design — a group is
 * not a new kind of appointment, it is a label tying several normal ones
 * together, so everything that already works on a booking keeps working on
 * these: dragging, cancelling, reminders, takings, closing one off.
 *
 * A clash skips that row rather than failing the lot. Somebody booking five
 * people at once has typed five sets of details, and losing all of it because
 * the fourth overlaps an existing appointment would be the cruellest possible
 * response to the most tedious piece of typing in the product.
 */
export async function createBookingGroup(
  _prev: GroupState,
  fd: FormData,
): Promise<GroupState> {
  const { studio } = await requireStudio();
  const supabase = await createClient();
  const artists = await getArtists(studio.id);

  const name = str(fd, "name");
  if (!name) return { error: "Give it a name — whose wedding, or which address." };

  const date = str(fd, "date");
  const rows = readRows(fd);
  if (rows.length === 0) return { error: "Add at least one person." };

  for (const row of rows) {
    if (!artists.some((a) => a.id === row.artistId)) {
      return { error: `${row.who} is down for somebody who does not work here.` };
    }
    if (row.minutes < 5 || row.minutes > 1440) {
      return { error: `How long is ${row.who}? Between 5 minutes and 24 hours.` };
    }
    if (!instantFrom(date, row.time, studio.timezone)) {
      return { error: `Check the time for ${row.who}.` };
    }
  }

  const { data: group, error: groupError } = await supabase
    .from("booking_groups")
    .insert({
      studio_id: studio.id,
      name,
      notes: str(fd, "notes") || null,
    })
    .select("id")
    .single();

  if (groupError || !group) {
    return { error: groupError?.message ?? "Could not start the group." };
  }

  const made: string[] = [];
  const skipped: string[] = [];

  /*
   * Who gets rung when the whole thing has to move.
   *
   * The first person named, which is the bride, the mother, whoever rang up —
   * true far more often than not, and it costs nobody an extra field on a form
   * that is already the most typing in the product.
   *
   * The column has existed since groups were built and nothing has ever set
   * it, so every arrangement has carried an organiser that was always null.
   * It is read on the appointment too, so this does not simply move the
   * problem from unwritten to unread.
   */
  let leadContactId: string | null = null;

  for (const row of rows) {
    /*
     * Somebody new still gets a record.
     *
     * A wedding party is half regulars and half people who have never been in,
     * and the ordinary form makes a client out of a typed name — so this does
     * too. Without it the bridesmaids exist only as words on a booking, have no
     * history, and cannot be found next time they ring.
     *
     * Failure here is not fatal: the appointment matters more than the record,
     * and a booking with a name on it beats no booking at all.
     */
    let contactId = row.contactId;

    // A picked client has to be one of this business's; anything else is a name.
    if (contactId) {
      const { data: ours } = await supabase
        .from("contacts")
        .select("id")
        .eq("id", contactId)
        .eq("studio_id", studio.id)
        .maybeSingle();
      contactId = ours?.id ?? null;
    }

    if (!contactId) {
      const { data: made } = await supabase
        .from("contacts")
        .insert({ studio_id: studio.id, name: row.who, channel: "web" })
        .select("id")
        .maybeSingle();
      contactId = made?.id ?? null;
    }

    // The first one we end up with is the organiser.
    if (!leadContactId && contactId) leadContactId = contactId;

    const starts = instantFrom(date, row.time, studio.timezone)!;
    const ends = new Date(starts.getTime() + row.minutes * 60_000);

    const pounds = Number(row.price.replace(/[£,\s]/g, ""));
    const pricePence =
      row.price !== "" && Number.isFinite(pounds) && pounds >= 0
        ? Math.round(pounds * 100)
        : null;

    const { data: booking, error } = await supabase
      .from("bookings")
      .insert({
        enquiry_id: null,
        /*
         * Their own record where the search found one.
         *
         * A wedding party is half regulars, and a bridesmaid typed in as a
         * bare name gets a second record — losing what the salon knows about
         * her, and putting this appointment somewhere her history is not.
         */
        contact_id: contactId,
        artist_id: row.artistId,
        group_id: group.id,
        source: "manual",
        type: "session",
        category: "appointment",
        all_day: false,
        blocks_availability: true,
        title: row.who,
        starts_at: starts.toISOString(),
        ends_at: ends.toISOString(),
        price_pence: pricePence,
        deposit_amount_pence: 0,
        // Nothing typed in by hand is waiting on a deposit, so the unpaid-hold
        // sweep must never take one of these back out of the diary.
        deposit_status: "paid",
        repeats: "none",
      })
      .select("id")
      .single();

    if (error || !booking) {
      skipped.push(row.who);
      continue;
    }

    made.push(booking.id);
    // Whose booking it is decides whose reminders they are.
    await scheduleReminders(supabase, studio.id, booking.id, starts.toISOString(), row.artistId);
  }

  /*
   * An arrangement nobody could be booked into is not an arrangement. Removing
   * it keeps the list honest rather than leaving an empty group somebody has
   * to work out the meaning of later.
   */
  if (made.length === 0) {
    await supabase.from("booking_groups").delete().eq("id", group.id);
    return { error: "Every one of them clashed with something already booked." };
  }

  /*
   * Written after the rows, because it is one of them.
   *
   * Failure is not worth reporting: the party is booked, and an arrangement
   * that does not know who organised it is a smaller loss than telling
   * somebody their five appointments did not go in when they did.
   */
  if (leadContactId) {
    await supabase
      .from("booking_groups")
      .update({ lead_contact_id: leadContactId })
      .eq("id", group.id);
  }

  revalidatePath("/diary");
  return { ok: true, made: made.length, skipped };
}

/**
 * Calling the whole thing off.
 *
 * Cancelled rather than deleted, exactly as a single booking is: the slots free
 * up, the history stays, and a deposit taken against any of them remains
 * traceable for a refund.
 *
 * The group itself survives the cancellation. Somebody asking in March what
 * happened to the February wedding should find it, cancelled, rather than find
 * nothing and conclude it was never booked.
 */
export async function cancelBookingGroup(
  _prev: GroupState,
  fd: FormData,
): Promise<GroupState> {
  const { studio } = await requireStudio();
  const supabase = await createClient();

  const id = str(fd, "group_id");
  if (!id) return { error: "Nothing to cancel." };

  const { data: group } = await supabase
    .from("booking_groups")
    .select("id")
    .eq("id", id)
    .eq("studio_id", studio.id)
    .maybeSingle();

  if (!group) return { error: "That group is not on this business." };

  const { data: cancelled, error } = await supabase
    .from("bookings")
    .update({ cancelled_at: new Date().toISOString() })
    .eq("group_id", id)
    .is("cancelled_at", null)
    .select("id");

  if (error) return { error: error.message };

  revalidatePath("/diary");
  return { ok: true, made: cancelled?.length ?? 0 };
}
