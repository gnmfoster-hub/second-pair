export type Channel = "web" | "whatsapp" | "instagram" | "sms" | "voice";
export type MessageRole = "client" | "assistant" | "owner" | "system";
export type ConvStatus =
  | "new"
  | "qualified"
  | "deposit_paid"
  | "booked"
  | "needs_human"
  | "lost";
export type EnquiryIntent =
  | "new_tattoo"
  | "cover_up"
  | "touch_up"
  | "consultation"
  | "question";
export type TattooStyle =
  | "traditional"
  | "fine_line"
  | "realism"
  | "blackwork"
  | "script"
  | "colour"
  | "black_and_grey"
  | "other";
export type BookingType = "consultation" | "session";
export type DepositStatus = "unpaid" | "link_sent" | "paid" | "refunded" | "forfeited";

export const TATTOO_STYLES: { value: TattooStyle; label: string }[] = [
  { value: "traditional", label: "Traditional" },
  { value: "fine_line", label: "Fine line" },
  { value: "realism", label: "Realism" },
  { value: "blackwork", label: "Blackwork" },
  { value: "script", label: "Script" },
  { value: "colour", label: "Colour" },
  { value: "black_and_grey", label: "Black and grey" },
  { value: "other", label: "Other" },
];

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
};

export type Artist = {
  id: string;
  studio_id: string;
  name: string;
  styles: TattooStyle[];
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
