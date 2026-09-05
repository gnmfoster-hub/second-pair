/* Kept in step with the `channel` enum in the database. Messenger was added
   with the channel connections and missed here, so a Messenger conversation
   would have rendered with no label at all. */
export type Channel =
  | "web"
  | "whatsapp"
  | "instagram"
  | "messenger"
  | "sms"
  | "email"
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
  email: "Email",
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
  /** Where replies to email we send on their behalf go. */
  email: string | null;
  tone: string;
  hours: OpeningHours[];
  /** Hex without the hash. Null means our own navy. */
  /** customer counts in the figures; demo is for showing people; internal is ours. */
  kind: "customer" | "demo" | "internal";
  widget_accent: string | null;
  widget_position: "right" | "left";
  /** The nudge shown a few seconds after landing. Null means the default. */
  widget_teaser: string | null;
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

  /*
   * Who answers an enquiry first. See lib/answering.ts — none of these is off.
   */
  answering_mode: "always" | "when_free" | "always_ask_me";
  /** Minutes of head start on channels where nobody is sitting watching. */
  first_refusal_minutes: number;
  /** "I've got this", with an end time. Null when it is not in force. */
  mine_until: string | null;

  /*
   * The commercial side, which belongs to Second Pair rather than to the
   * business. Never shown to them; see the admin suite.
   */
  plan: string | null;
  plan_pence: number;
  /** Maximum active people. Null means no limit. */
  seat_limit: number | null;
  account_status: "trial" | "active" | "overdue" | "paused" | "closed";
  billing_started_on: string | null;
  account_note: string | null;
  /** Channels this business may use. Everything else is refused on arrival. */
  channels_allowed: Channel[];
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
/** One evening somebody has said they will work, on one date. */
export type ExtraHours = { date: string; open: string; close: string };

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
  /** Where to send their invitation. Optional — a link can be copied instead. */
  email: string | null;
  /** What they do, in the business's own words. Suggested by the trade. */
  role: string | null;
  /** Their opening line, used only on their own link. Null uses the shop's. */
  greeting: string | null;
  /** How they write, used only on their own link. Null uses the shop's. */
  tone: string | null;
  /** Their own working week. Null follows the business's hours. */
  hours: OpeningHours[] | null;
  /** The regular gaps inside it: lunch, a school run, an early finish. */
  time_off: TimeOff[];
  /**
   * One-off working hours for particular dates — a late night, or coming in on
   * a day they are normally off. Widens that day for this person only.
   */
  extra_hours: ExtraHours[];
  /** Their login, once they accept an invite. Null is a normal team member. */
  user_id: string | null;
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
