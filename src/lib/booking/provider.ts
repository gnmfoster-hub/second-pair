/**
 * Booking providers.
 *
 * Businesses keep their existing diary. Most already run one — Fresha, Booksy,
 * Treatwell, Square — and none of them will be replaced by an enquiry tool, so
 * the job is to read availability where we can and hand the booking to whatever
 * system already owns it.
 *
 * Three capabilities, and a provider may support any combination:
 *
 *   reads availability  we can offer real times
 *   writes bookings     we can put the appointment in the diary ourselves
 *   hands over a link   the customer books themselves, in their system
 *
 * The conversation adapts to what the provider can actually do, so the
 * assistant never offers a slot it cannot stand behind.
 */

export type Slot = { starts_at: string; ends_at: string };

export type BusyPeriod = { starts_at: string; ends_at: string };

export type ProviderCapabilities = {
  readsAvailability: boolean;
  writesBookings: boolean;
  handsOverLink: boolean;
};

export type ProviderConfig = {
  kind: ProviderKind;
  /** Google Calendar id, or an iCal subscription URL. */
  calendar_id?: string | null;
  ical_url?: string | null;
  /** Public booking page the customer is sent to. */
  booking_url?: string | null;
};

export type ProviderKind = "google" | "ical_link" | "link_only" | "manual";

export type BookingProvider = {
  kind: ProviderKind;
  label: string;
  capabilities: ProviderCapabilities;

  /** Busy periods in the window. Empty when the provider cannot read a diary. */
  busy(config: ProviderConfig, from: Date, to: Date): Promise<BusyPeriod[]>;

  /** Writes to the diary. Null when the provider cannot, which is most of them. */
  book?(config: ProviderConfig, slot: Slot, summary: string): Promise<string | null>;
};

export const PROVIDERS: Record<ProviderKind, ProviderCapabilities> = {
  // Full two-way. For businesses with no booking platform of their own.
  google: { readsAvailability: true, writesBookings: true, handsOverLink: false },

  // Fresha, Booksy, Treatwell, Square, Vagaro. They publish an iCal export of
  // the diary and a public booking page, but no write API — so we read
  // availability from the feed and let the customer book on their page. Their
  // system stays the source of truth and nobody retypes anything.
  ical_link: { readsAvailability: true, writesBookings: false, handsOverLink: true },

  // A booking page and nothing else. We qualify, quote, and hand over.
  link_only: { readsAvailability: false, writesBookings: false, handsOverLink: true },

  // No diary we can reach. Take preferred times; the owner confirms.
  manual: { readsAvailability: false, writesBookings: false, handsOverLink: false },
};

export const PROVIDER_LABELS: Record<ProviderKind, string> = {
  google: "Google Calendar",
  ical_link: "Booking platform (Fresha, Booksy, Square…)",
  link_only: "Booking link only",
  manual: "No calendar connected",
};

/**
 * What the assistant is allowed to say about booking, given what the provider
 * can do. Written into the system prompt so the conversation and the mechanism
 * cannot drift apart.
 */
export function bookingInstructions(
  kind: ProviderKind,
  bookingUrl: string | null | undefined,
): string {
  const caps = PROVIDERS[kind];

  if (caps.writesBookings) {
    return [
      "You can see real availability and book it yourself.",
      "Call get_available_slots and offer only what it returns — never invent a time.",
      "Once they pick one, call create_booking.",
    ].join(" ");
  }

  if (caps.readsAvailability && caps.handsOverLink) {
    return [
      "You can see when the diary is free, but the booking itself is made on the",
      "business's own booking page.",
      "Call get_available_slots to suggest times that are genuinely open, then send them",
      bookingUrl ? `the booking link: ${bookingUrl}` : "the booking link",
      "to confirm it themselves.",
      "Say the times are what looks free right now and their page confirms it —",
      "the diary can move in the minutes between.",
    ].join(" ");
  }

  if (caps.handsOverLink) {
    return [
      "You cannot see the diary, so never suggest a specific time.",
      "Ask which days and times generally suit them, then send them",
      bookingUrl ? `the booking link: ${bookingUrl}` : "the booking link",
      "to pick a slot themselves.",
    ].join(" ");
  }

  return [
    "You have no access to the diary. Never offer or imply a specific date or time.",
    "Take the days and times that suit them and tell them the business will confirm.",
  ].join(" ");
}
