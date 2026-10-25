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
 * Two things, and neither of them is about which chat window it came through.
 *
 * The appointment must belong to the contact this conversation belongs to.
 * On email, text and the rest the thread key is the address or the number the
 * message arrived from, so that is settled by arriving. On the website it is
 * settled by saveContact, which moves a conversation onto an existing client
 * record only where the email or the number given is already on it and the
 * first name agrees.
 *
 * And the assistant must have made it. One it took is its to move; one
 * somebody at the business typed into the diary is theirs, because they may
 * have taken it on the phone and promised something nobody here knows about.
 * The whole of that reasoning is at madeByTheAssistant in whichBooking.ts.
 *
 * It was narrower than this for a day: on the website, only an appointment
 * made in that same conversation. Giles walked the flow on 25 October, was
 * refused twice on his own clean with his own email in front of it, and said
 * where the line actually belongs: "it should be able to change as long as
 * there is time in the diary but only if it was an assistant booking in the
 * first place."
 *
 * What is left is somebody who knows a customer's address or number and
 * their first name. If that happens the customer is emailed about the change
 * and the business is alerted, both within the minute, so it cannot happen
 * quietly. Giles's call, made with that in front of him.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { recordBookingEvent } from "@/lib/bookingHistory";
import { scheduleReminders, dropReminders } from "@/lib/reminders";
import { cancelBooking } from "@/lib/booking";
import { alertBookingChanged } from "@/lib/notify";
import { sendCancellationNotice } from "@/lib/messaging/cancelled";
import { whichBooking, madeByTheAssistant, type Candidate } from "./whichBooking";
import { provedWhoTheyAre } from "./mayChange";

export { provedWhoTheyAre };

export type Changed =
  | { ok: true; what: "cancelled"; was: string }
  | { ok: true; what: "moved"; was: string; now: string }
  | { ok: false; because: string; handToAPerson: boolean };

type BookingRow = Candidate & {
  contact_id: string | null;
  enquiry_id: string | null;
  source: string | null;
  ends_at: string;
  cancelled_at: string | null;
  artist_id: string | null;
  deposit_amount_pence: number | null;
  deposit_status: string | null;
};

const COLUMNS =
  "id, contact_id, enquiry_id, source, starts_at, ends_at, cancelled_at, repeats, " +
  "repeat_parent_id, group_id, artist_id, deposit_amount_pence, deposit_status";

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
     * False on the website, where an empty answer may not be stated as a
     * fact. It does not decide what is in reach. See mayChange.ts.
     */
    proved?: boolean;
    now?: number;
  },
) {
  /*
   * Everything on the record, then narrowed here rather than in the query.
   *
   * One read, and it is the only way to tell the two refusals apart: "you
   * have nothing booked" and "you have one and it is not mine to change" are
   * completely different sentences, and saying the first to somebody who does
   * have an appointment is the worst answer this code can give. See
   * whichBooking, where that is decided.
   */
  const { data: rows } = await db
    .from("bookings")
    .select(COLUMNS)
    .eq("contact_id", args.contactId)
    .is("cancelled_at", null)
    .order("starts_at");

  const all = (rows ?? []) as unknown as BookingRow[];
  const now = args.now ?? Date.now();

  /* Ours to change, and the business's own. */
  const ours = all.filter((b) => madeByTheAssistant(b.source));
  const theirs = all.filter(
    (b) => Date.parse(b.starts_at) >= now && !madeByTheAssistant(b.source),
  ).length;

  return whichBooking(ours, {
    which: args.which,
    now,
    outOfReach: theirs,
    unproved: args.proved === false,
  });
}

/** Their appointment, off. */
export async function cancelTheirBooking(
  db: SupabaseClient,
  args: {
    studioId: string;
    which?: string | null;
    contactId: string;
    proved?: boolean;
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
    proved?: boolean;
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
