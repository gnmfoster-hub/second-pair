export type Channel = "web" | "whatsapp" | "instagram" | "sms" | "voice";
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
  stripe_account_id: string | null;
  timezone: string;
  vertical: string;
  vocabulary: Record<string, string>;
};

export type Artist = {
  id: string;
  studio_id: string;
  name: string;
  styles: StyleKey[];
  hourly_rate_pence: number;
  min_charge_pence: number;
  day_rate_pence: number | null;
  calendar_id: string | null;
  active: boolean;
};

export type PriceBand = {
  id: string;
  studio_id: string;
  size_label: string;
  hours_low: number;
  hours_high: number;
  sort_order: number;
  requires_consultation: boolean;
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
