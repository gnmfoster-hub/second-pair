/**
 * A customer moving or cancelling their own appointment.
 *
 * The choosing is in whichBooking.ts, which has no database in it and is
 * tested on its own. This is the half that writes, and the two things it must
 * not forget are both things the diary already knew and this did not when it
 * was first written:
 *
 *   - Cancelling must drop the reminders. Otherwise "see you tomorrow" goes
 *     out for an appointment that is not happening, which is worse than
 *     saying nothing at all.
 *   - Moving must drop them and plan them again. A reminder scheduled against
 *     the old time is a message about a time they are not coming at.
 *
 * cancelBooking in ./index.ts does the first of those and is used here rather
 * than copied, because the one in the diary and the one in a conversation
 * drifting apart is exactly how that gets missed twice.
 *
 *
 * Who is allowed to do it
 * -----------------------
 *
 * The appointment must belong to the contact this conversation belongs to.
 * And on a channel that has not proved who they are, it must also have been
 * made in this very conversation.
 *
 * The second half is not belt and braces. It was written here first as a note
 * saying it was unnecessary, on the reasoning that a web conversation gets a
 * fresh contact of its own because its thread key is an invented session id
 * that matches nobody. That reasoning was wrong, and reading saveContact is
 * what showed it: `rejoin` deliberately moves a conversation onto an existing
 * client record when somebody gives a phone number or an email already on
 * file and a first name that agrees. It is good behaviour and the reason a
 * returning customer's history is in front of the business instead of
 * scattered. It also means a website visitor who types a real customer's
 * number and first name is, from this file's point of view, that customer.
 *
 * Nothing on a web page proves anything. A number is a thing anybody can
 * type, which the rejoin code says in as many words: "on a website a phone
 * number proves nothing at all". So on the website the reach is this
 * conversation only, which is the case that actually matters anyway, because
 * somebody cancelling over chat is nearly always cancelling what they booked
 * minutes ago. A returning customer wanting an older appointment moved is
 * handed to a person, and that is the right answer rather than a shortfall.
 *
 * The proved channels are listed rather than the unproved ones, so a channel
 * added later is strict until somebody decides otherwise. Email, text,
 * WhatsApp, Instagram, Messenger and a phone call all key the thread on an
 * address, a number or an account the person had to be holding.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { recordBookingEvent } from "@/lib/bookingHistory";
import { scheduleReminders, dropReminders } from "@/lib/reminders";
import { cancelBooking } from "@/lib/booking";
import { alertBookingChanged } from "@/lib/notify";
import { sendCancellationNotice } from "@/lib/messaging/cancelled";
import { whichBooking, type Candidate } from "./whichBooking";
import { reachesWholeRecord } from "./mayChange";

export { reachesWholeRecord };

export type Changed =
  | { ok: true; what: "cancelled"; was: string }
  | { ok: true; what: "moved"; was: string; now: string }
  | { ok: false; because: string; handToAPerson: boolean };

type BookingRow = Candidate & {
  contact_id: string | null;
  ends_at: string;
  cancelled_at: string | null;
  artist_id: string | null;
  deposit_amount_pence: number | null;
  deposit_status: string | null;
};

const COLUMNS =
  "id, contact_id, enquiry_id, starts_at, ends_at, cancelled_at, repeats, repeat_parent_id, " +
  "group_id, artist_id, deposit_amount_pence, deposit_status";

/**
 * The one appointment this request is about, or the reason there is not one.
 *
 * Shared by both verbs. The reading is scoped to the contact and to rows that
 * are not already cancelled; everything after that is the pure choosing.
 */
export async function theirBooking(
  db: Pick<SupabaseClient, "from">,
  args: {
    which?: string | null;
    contactId: string;
    /**
     * Set on an unproved channel, and then only appointments made in this
     * conversation are in reach. See the top of the file.
     */
    onlyFromConversation?: string | null;
    now?: number;
  },
) {
  /*
   * The enquiries this conversation has had, when the reach is narrowed.
   *
   * Bookings hang off an enquiry rather than off a conversation, and a
   * conversation can have more than one enquiry over its life, so it is a
   * list. No enquiries means nothing was ever booked here, which is a plain
   * answer rather than a failure.
   */
  let onlyEnquiries: string[] | null = null;
  if (args.onlyFromConversation) {
    const { data: mine } = await db
      .from("enquiries")
      .select("id")
      .eq("conversation_id", args.onlyFromConversation);
    onlyEnquiries = ((mine ?? []) as unknown as { id: string }[]).map((e) => e.id);
  }

  let q = db
    .from("bookings")
    .select(COLUMNS)
    .eq("contact_id", args.contactId)
    .is("cancelled_at", null);

  if (onlyEnquiries) {
    /* An empty list would match everything if it were left out, so it is
       passed through as an impossible value rather than skipped. */
    q = q.in("enquiry_id", onlyEnquiries.length ? onlyEnquiries : ["00000000-0000-0000-0000-000000000000"]);
  }

  const { data: rows } = await q.order("starts_at");

  return whichBooking((rows ?? []) as unknown as BookingRow[], {
    which: args.which,
    now: args.now ?? Date.now(),
  });
}

/** Their appointment, off. */
export async function cancelTheirBooking(
  db: SupabaseClient,
  args: {
    studioId: string;
    which?: string | null;
    contactId: string;
    onlyFromConversation?: string | null;
    now?: number;
  },
): Promise<Changed> {
  const found = await theirBooking(db, args);
  if (!found.ok) return found;

  const { booking } = found;

  /*
   * Cancelled rather than deleted, exactly as the diary does it: the slot
   * frees up, the history stays, and a deposit already paid stays traceable.
   * cancelBooking also drops the reminders, which is the whole reason for
   * going through it.
   */
  await cancelBooking(db, booking.id);

  await recordBookingEvent(db, {
    bookings: booking.id,
    what: "cancelled",
    source: "customer",
    detail: { starts_at: booking.starts_at },
  });

  /*
   * Both of the people this matters to, told without being asked.
   *
   * Awaited rather than left floating, even though neither can throw. This
   * runs inside a request on a serverless host, and a promise still in flight
   * when the response goes out is a promise that may simply be killed: the
   * silence Jess got, rebuilt by accident.
   */
  await sendCancellationNotice(db, booking.id, "them");
  await alertBookingChanged(db, booking.id, "cancelled", booking.starts_at);

  return { ok: true, what: "cancelled", was: booking.starts_at };
}

/** Their appointment, at a different time. */
export async function moveTheirBooking(
  db: SupabaseClient,
  args: {
    studioId: string;
    which?: string | null;
    contactId: string;
    onlyFromConversation?: string | null;
    startsAt: string;
    endsAt: string;
    now?: number;
  },
): Promise<Changed> {
  const found = await theirBooking(db, args);
  if (!found.ok) return found;

  const { booking } = found;
  const now = args.now ?? Date.now();

  const to = Date.parse(args.startsAt);
  if (!Number.isFinite(to) || to < now) {
    return { ok: false, because: "that time is not a real time ahead of now", handToAPerson: false };
  }

  const { error } = await db
    .from("bookings")
    .update({ starts_at: args.startsAt, ends_at: args.endsAt, updated_at: new Date().toISOString() })
    .eq("id", booking.id)
    .is("cancelled_at", null);

  if (error) {
    /*
     * 23P01: the exclusion constraint refused an overlap, the same answer
     * createBooking gets when a slot goes between being offered and being
     * taken. Said as its own thing because the assistant can do something
     * about this one, which is offer them another time.
     */
    if (error.code === "23P01") {
      return { ok: false, because: "that time has just gone, so offer them another", handToAPerson: false };
    }
    return { ok: false, because: "the diary would not accept the change", handToAPerson: true };
  }

  /*
   * The old reminders are about a time they are not coming at. Dropped and
   * planned again, and the confirmation is allowed to go: it is the written
   * record of the new time, and being told twice beats Jess's problem, which
   * was being told nothing.
   */
  await dropReminders(db, booking.id);
  await scheduleReminders(db, args.studioId, booking.id, args.startsAt, booking.artist_id);

  await recordBookingEvent(db, {
    bookings: booking.id,
    what: "moved",
    source: "customer",
    detail: { from: booking.starts_at, to: args.startsAt },
  });

  /* The customer gets the rescheduled confirmation above; this is the half
     that reaches the business, whose morning has just changed. */
  await alertBookingChanged(db, booking.id, "moved", booking.starts_at);

  return { ok: true, what: "moved", was: booking.starts_at, now: args.startsAt };
}
