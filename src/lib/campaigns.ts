/**
 * Which campaign messages are due, and to whom.
 *
 * A campaign follows a job: six weeks after a colour, ask if they want another.
 * That is the shape Giles asked for, and it is the right one for a business of
 * one — a mailing list is something somebody has to remember to use, and these
 * are people with their hands full.
 *
 * Kept apart from the database and the sending, like reminderSchedule.ts and
 * reminderCover.ts, because the rules are the part that can be quietly wrong
 * and the rest cannot be loaded by a test. Everything here is a decision about
 * who should hear from a business, which is exactly the kind of thing that is
 * wrong for weeks before anybody notices — a campaign that sends nothing looks
 * identical to a campaign nobody qualifies for.
 */

import { mayMarket, type MarketingBusiness, type MarketingPerson, type Channel } from "./marketingPlan.ts";

export type Campaign = {
  id: string;
  name: string;
  body: string;
  channel: Channel;
  /** The job it follows, by name. Null or empty means any appointment. */
  after_service?: string | null;
  after_days: number;
  enabled?: boolean | null;
};

export type PastBooking = {
  id: string;
  /** What was booked. Bookings carry the job's name rather than its id. */
  title?: string | null;
  starts_at: string;
  cancelled_at?: string | null;
  category?: string | null;
  contact: MarketingPerson & { id: string; name?: string | null };
};

export type Due = {
  campaign: Campaign;
  booking: PastBooking;
  /** Claimed under this before sending, so a sweep running twice cannot repeat it. */
  key: string;
};

/** What a send is claimed under. One per campaign per booking, for ever. */
export function campaignKey(campaignId: string, bookingId: string): string {
  return `campaign:${campaignId}:${bookingId}`;
}

/**
 * Whether a booking is the kind of thing a campaign follows.
 *
 * Only real appointments. A campaign that followed somebody's lunch break or a
 * block of time off would write to whoever happened to be attached to it —
 * and "time off" rows carry a contact often enough for that to be a real
 * possibility rather than a theoretical one.
 */
function isAppointment(booking: PastBooking): boolean {
  const category = booking.category ?? "appointment";
  return category === "appointment" || category === "consultation";
}

/**
 * Names match loosely, because a person typed one of them.
 *
 * A booking's title is copied from the service when it is booked, so they are
 * usually identical — but a title typed into the diary by hand is "half head
 * foils" against a service called "Half head foils", and a campaign that
 * silently misses those is a campaign that looks broken.
 */
function sameJob(title: string | null | undefined, wanted: string | null | undefined): boolean {
  const want = wanted?.trim().toLowerCase();
  if (!want) return true; // any appointment
  return (title ?? "").trim().toLowerCase() === want;
}

/**
 * Everything a sweep should send now.
 *
 * `alreadySent` is the set of keys already claimed. Passed in rather than
 * looked up here so this stays pure, and so the caller can claim in one query
 * rather than one per booking.
 *
 * The window is deliberate. A campaign due "42 days after" is sent on the day
 * it falls due and not afterwards: the sweep runs every few hours, so a single
 * day is generous, and without an upper bound switching on a campaign would
 * write to everybody who has ever been in — which is the one mistake in this
 * whole area that cannot be taken back.
 */
export function dueNow(
  studio: MarketingBusiness,
  campaigns: Campaign[],
  bookings: PastBooking[],
  alreadySent: Set<string>,
  now: Date = new Date(),
): Due[] {
  const out: Due[] = [];

  for (const campaign of campaigns) {
    if (campaign.enabled === false) continue;
    if (!mayMarket(studio, { marketing_email: true, marketing_sms: true, email: "x", phone: "x" }, campaign.channel)) {
      /* The business has not bought this channel. Nobody on it, whatever they agreed. */
      continue;
    }

    for (const booking of bookings) {
      if (booking.cancelled_at) continue;
      if (!isAppointment(booking)) continue;
      if (!sameJob(booking.title, campaign.after_service)) continue;

      const when = Date.parse(booking.starts_at);
      if (!Number.isFinite(when)) continue;

      const daysSince = (now.getTime() - when) / 86_400_000;
      if (daysSince < campaign.after_days) continue;
      if (daysSince >= campaign.after_days + 1) continue;

      /* And the person's own answer, which no entitlement overrides. */
      if (!mayMarket(studio, booking.contact, campaign.channel)) continue;

      const key = campaignKey(campaign.id, booking.id);
      if (alreadySent.has(key)) continue;

      out.push({ campaign, booking, key });
    }
  }

  return out;
}

/**
 * How many people a campaign would reach if it ran over these bookings today.
 *
 * For the screen, beside the send. "Everybody who had a colour" and "everybody
 * who had a colour and agreed to hear from you" are very different numbers,
 * and only the second one may be sent.
 */
export function wouldReach(
  studio: MarketingBusiness,
  campaign: Campaign,
  bookings: PastBooking[],
): number {
  const people = new Set<string>();
  for (const booking of bookings) {
    if (booking.cancelled_at || !isAppointment(booking)) continue;
    if (!sameJob(booking.title, campaign.after_service)) continue;
    if (!mayMarket(studio, booking.contact, campaign.channel)) continue;
    people.add(booking.contact.id);
  }
  return people.size;
}
