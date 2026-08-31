/* Kept in step with the `channel` enum in the database. Messenger was added
   with the channel connections and missed here, so a Messenger conversation
   would have rendered with no label at all. */
export type Channel =
  | "web"
  | "whatsapp"
  | "instagram"
  | "messenger"
  | "sms"
  | "voice";
export type MessageRole = "client" | "assistant" | "owner" | "system";
export type ConvStatus =
  | "new"
  | "qualified"
  | "deposit_paid"
  | "booked"
  | "needs_human"
  | "lost";
/** Was a Postgres enum; now a key into the studio's own service_options. */
export type StyleKey = string;
export type IntentKey = string;
export type BookingType = "consultation" | "session";
export type DepositStatus = "unpaid" | "link_sent" | "paid" | "refunded" | "forfeited";

/** A studio's own pick-list, loaded from service_options. */
export type ServiceOption = {
  id: string;
  studio_id: string;
  kind: "style" | "intent";
  value: string;
  label: string;
  sort_order: number;
};

export const labelFor = (options: ServiceOption[], value: string | null | undefined) =>
  options.find((o) => o.value === value)?.label ?? value ?? null;

export const CONV_STATUS_LABELS: Record<ConvStatus, string> = {
  new: "New",
  qualified: "Qualified",
  deposit_paid: "Deposit paid",
  booked: "Booked",
  needs_human: "Needs human",
  lost: "Lost",
};

export const CHANNEL_LABELS: Record<Channel, string> = {
  web: "Website",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  messenger: "Messenger",
  sms: "SMS",
  voice: "Voice",
};

/** Opening hours. day is 0 = Sunday through 6 = Saturday, matching Date#getDay. */
export type OpeningHours = {
  day: number;
  open: string; // "10:00"
  close: string; // "18:00"
  closed: boolean;
};

export type DepositRule =
  | { type: "fixed"; amount_pence: number }
  | { type: "percent"; percent: number; min_pence: number };

export const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export type Studio = {
  id: string;
  name: string;
  slug: string;
  tone: string;
  hours: OpeningHours[];
  deposit_rule: DepositRule;
  cancellation_policy: string;
  privacy_notice_url: string | null;
  /** Opening line in the widget. Null falls back to the trade pack. */
  greeting: string | null;
  /** What an entry's colour means in the diary. */
  diary_colour: "category" | "client" | "person";
  /** Secret in the subscribe URL for the whole business. */
  calendar_token: string;
  /** Facts to work in where relevant. Not a script. */
  always_mention: string[];
  /** Hard don'ts, in the owner's own words. */
  never_mention: string[];
  /** Extra reasons to fetch a human, on top of the built-in ones. */
  escalate_when: string[];
  /** How this business writes, shown rather than described. */
  voice_examples: { ask: string; reply: string }[];
  terms_url: string | null;
  stripe_account_id: string | null;
  timezone: string;
  vertical: string;
  vocabulary: Record<string, string>;
  deposit_mode: "required" | "optional" | "none";
  vat_registered: boolean;
  vat_rate_percent: number;
  prices_include_vat: boolean;
  vat_number: string | null;
  travel_mode: "at_premises" | "at_customer" | "both";
  travel_buffer_minutes: number;
  service_areas: string[];
  notice_hours: number;
  consultation_minutes: number;
  max_session_minutes: number;
};

/**
 * A regular gap inside somebody's working week.
 *
 * Recurring by nature — a one-off belongs in the diary, where it can be moved
 * and cancelled like anything else.
 */
export type TimeOff = {
  label: string;
  /** 0-6, Sunday first, matching hours and JavaScript. */
  days: number[];
  from: string;
  to: string;
};

export type Artist = {
  id: string;
  studio_id: string;
  name: string;
  /** Short name used in this person's own booking link. */
  handle: string | null;
  /** Their own working week. Null follows the business's hours. */
  hours: OpeningHours[] | null;
  /** The regular gaps inside it: lunch, a school run, an early finish. */
  time_off: TimeOff[];
  /** Their login, once they accept an invite. Null is a normal team member. */
  user_id: string | null;
  /** Their own opening line and voice. Null follows the business. */
  greeting: string | null;
  tone: string | null;
  /** Secret in their own calendar subscribe URL. */
  calendar_token: string;
  styles: StyleKey[];
  hourly_rate_pence: number;
  min_charge_pence: number;
  day_rate_pence: number | null;
  calendar_id: string | null;
  active: boolean;
  booking_provider: string;
  ical_url: string | null;
  booking_url: string | null;
  avatar_path: string | null;
  colour: string | null;
};

export type PriceBand = {
  id: string;
  studio_id: string;
  size_label: string;
  hours_low: number;
  hours_high: number;
  sort_order: number;
  requires_consultation: boolean;
  /** Set for a flat-price service; null means price by the hour. */
  price_low_pence: number | null;
  price_high_pence: number | null;
  duration_minutes: number | null;
};

export type Faq = {
  id: string;
  studio_id: string;
  question: string;
  answer: string;
  sort_order: number;
};

export const DEFAULT_HOURS: OpeningHours[] = [
  { day: 0, open: "11:00", close: "16:00", closed: true },
  { day: 1, open: "10:00", close: "18:00", closed: false },
  { day: 2, open: "10:00", close: "18:00", closed: false },
  { day: 3, open: "10:00", close: "18:00", closed: false },
  { day: 4, open: "10:00", close: "20:00", closed: false },
  { day: 5, open: "10:00", close: "20:00", closed: false },
  { day: 6, open: "10:00", close: "18:00", closed: false },
];
