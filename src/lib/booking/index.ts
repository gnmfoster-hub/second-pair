import type { SupabaseClient } from "@supabase/supabase-js";
import type { Artist, PriceBand, Studio } from "@/lib/types";
import { busyFromIcal } from "./ical";
import { scheduleReminders, dropReminders } from "@/lib/reminders";
import { findSlots, describeSlot } from "./slots";
import { withTravelTime } from "@/lib/travel";
import { timeOffAsBusy } from "./timeOff";
import {
  PROVIDERS,
  bookingInstructions,
  type BusyPeriod,
  type ProviderKind,
  type Slot,
} from "./provider";

export { describeSlot, bookingInstructions, PROVIDERS };
export type { Slot, ProviderKind };

const kindOf = (artist: Artist | undefined): ProviderKind =>
  (artist?.booking_provider as ProviderKind) ?? "native";

/**
 * What this person's diary can do.
 *
 * Nobody set up is a real state, not a bug: it is every business between
 * signing up and filling the form in, and their first enquiry can arrive in
 * that window. It used to crash the whole reply. It now falls back to the
 * manual provider, which offers no times and asks when suits instead.
 */
export function capabilitiesFor(artist: Artist | undefined) {
  if (!artist) return PROVIDERS.manual;
  return PROVIDERS[kindOf(artist)] ?? PROVIDERS.manual;
}

/**
 * When this person is unavailable, whatever holds their diary.
 *
 * A provider that cannot be reached returns no busy periods, which would make a
 * full diary look empty — so failures throw rather than resolve to nothing. The
 * caller degrades to asking for preferred times instead.
 */
export async function busyFor(
  db: SupabaseClient,
  artist: Artist,
  from: Date,
  to: Date,
): Promise<BusyPeriod[]> {
  const kind = kindOf(artist);

  if (kind === "native") {
    await releaseExpiredHolds(db, artist.id);

    const { data, error } = await db
      .from("bookings")
      .select("starts_at, ends_at")
      .eq("artist_id", artist.id)
      .is("cancelled_at", null)
      // Reminders sit in the diary without taking the time.
      .eq("blocks_availability", true)
      .lt("starts_at", to.toISOString())
      .gt("ends_at", from.toISOString());

    if (error) throw new Error(`Could not read the diary: ${error.message}`);
    return (data ?? []) as BusyPeriod[];
  }

  if (kind === "ical_link") {
    if (!artist.ical_url) throw new Error("No calendar feed is connected.");
    return busyFromIcal(artist.ical_url, from, to);
  }

  if (kind === "google") {
    // Day 3b. Until the OAuth flow exists, refusing is safer than pretending
    // the diary is empty and offering a slot on top of real work.
    throw new Error("Google Calendar is not connected yet.");
  }

  // link_only and manual cannot see a diary at all, which is why they never
  // offer specific times.
  return [];
}

/**
 * Frees slots held for a deposit that never arrived.
 *
 * Done lazily, just before availability is read, so it needs no scheduler and
 * cannot leave a slot stranded because a cron job failed. Cancelling rather
 * than deleting keeps the abandoned attempt visible to the owner, and releases
 * the overlap constraint, which only applies to live bookings.
 */
export async function releaseExpiredHolds(
  db: SupabaseClient,
  artistId?: string,
): Promise<number> {
  let query = db
    .from("bookings")
    .update({ cancelled_at: new Date().toISOString() })
    .eq("deposit_status", "unpaid")
    .is("cancelled_at", null)
    .lt("held_until", new Date().toISOString());

  if (artistId) query = query.eq("artist_id", artistId);

  const { data, error } = await query.select("id");
  if (error) return 0;
  return (data ?? []).length;
}

export type SlotSearch = {
  db: SupabaseClient;
  studio: Studio;
  artist: Artist;
  durationMinutes: number;
  limit?: number;
  now?: Date;
};

/** Offerable times for one person. Empty when their provider cannot see a diary. */
export async function availableSlots(search: SlotSearch): Promise<Slot[]> {
  const { db, studio, artist, durationMinutes, limit = 4, now = new Date() } = search;

  if (!capabilitiesFor(artist).readsAvailability) return [];

  const from = new Date(now.getTime() + studio.notice_hours * 3600_000);
  const to = new Date(from.getTime() + 21 * 86400_000);

  let busy = await busyFor(db, artist, from, to);

  // Work at the customer's address needs getting to. Padding what counts as
  // busy is what stops two jobs being booked back to back across a city.
  if (studio.travel_mode !== "at_premises") {
    busy = withTravelTime(busy, studio.travel_buffer_minutes);
  }

  // Lunch, the school run, an early finish on Fridays. Handed to the slot
  // finder as busy rather than taught as a second concept — these are exactly
  // the times a business gets caught out on, because they are invisible until
  // somebody is booked into one.
  busy = [...busy, ...timeOffAsBusy(artist.time_off ?? [], from, to, studio.timezone)];

  /*
   * This person's own week, if they have one.
   *
   * Hours were the business's only, so a stylist who works Tuesday, Thursday
   * and Saturday could not be described and the assistant cheerfully offered
   * her a Monday. Null still means "same as the business", which is what a
   * one-person business wants and what everybody starts as.
   */
  return findSlots({
    hours: artist.hours?.length ? artist.hours : studio.hours,
    /*
     * Whatever this person has said about particular days.
     *
     * Theirs alone, deliberately. One stylist staying late is not the salon
     * opening late, and offering somebody else's evening would book a customer
     * in with nobody there.
     */
    extraHours: artist.extra_hours ?? [],
    busy,
    durationMinutes,
    timezone: studio.timezone,
    noticeHours: studio.notice_hours,
    limit,
    now,
  });
}

/**
 * How long to set aside. A consultation is a fixed short appointment; a session
 * is the low end of the band, since running over is easier to absorb than a
 * gap nobody can fill.
 */
export function durationFor(
  studio: Studio,
  band: PriceBand | undefined,
  type: "consultation" | "session",
): number {
  if (type === "consultation") return studio.consultation_minutes;
  if (!band) return studio.consultation_minutes;
  // A flat-price service says how long it takes; there are no hours to derive
  // it from.
  if (band.duration_minutes != null) {
    return Math.min(band.duration_minutes, studio.max_session_minutes);
  }
  return Math.min(Math.round(band.hours_low * 60), studio.max_session_minutes);
}

/** Whether this band can go straight into a session, or needs a consultation first. */
export function bookingTypeFor(band: PriceBand | undefined): "consultation" | "session" {
  return band?.requires_consultation ? "consultation" : "session";
}

export type BookResult =
  | { ok: true; bookingId: string; calendarEventId: string | null }
  | { ok: false; reason: "taken" | "unsupported" | "error"; message: string };

/**
 * Writes the appointment to whichever diary the business keeps.
 *
 * The slot is held rather than confirmed: `held_until` gives the client a window
 * to pay the deposit, and a sweep releases it if they do not.
 */
export async function createBooking(args: {
  db: SupabaseClient;
  studio: Studio;
  artist: Artist;
  enquiryId: string;
  slot: Slot;
  type: "consultation" | "session";
  depositPence: number;
  /** Null confirms outright, for businesses that take no deposit. */
  holdMinutes?: number | null;
}): Promise<BookResult> {
  const { db, artist, enquiryId, slot, type, depositPence, holdMinutes = 60 } = args;

  if (!capabilitiesFor(artist).writesBookings) {
    return {
      ok: false,
      reason: "unsupported",
      message: "This diary cannot be written to — send them the booking link instead.",
    };
  }

  const { data, error } = await db
    .from("bookings")
    .insert({
      enquiry_id: enquiryId,
      artist_id: artist.id,
      type,
      starts_at: slot.starts_at,
      ends_at: slot.ends_at,
      deposit_amount_pence: depositPence,
      deposit_status: "unpaid",
      held_until:
        holdMinutes == null
          ? null
          : new Date(Date.now() + holdMinutes * 60_000).toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    // 23P01: the exclusion constraint refused an overlap. Someone took the slot
    // between it being offered and being accepted.
    if (error.code === "23P01") {
      return {
        ok: false,
        reason: "taken",
        message: "That time has just gone. Offer them the next available ones.",
      };
    }
    return { ok: false, reason: "error", message: error.message };
  }

  // Scheduled here rather than by the caller, so every route into a booking —
  // the assistant, the diary, a future import — gets reminders without having
  // to remember to ask for them.
  await scheduleReminders(db, artist.studio_id, data.id, slot.starts_at);

  return { ok: true, bookingId: data.id, calendarEventId: null };
}

/** Cancelling an appointment must never leave a reminder about it queued. */
export async function cancelBooking(db: SupabaseClient, bookingId: string) {
  await db
    .from("bookings")
    .update({ cancelled_at: new Date().toISOString() })
    .eq("id", bookingId);
  await dropReminders(db, bookingId);
}
