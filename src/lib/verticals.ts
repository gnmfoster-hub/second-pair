/**
 * Vertical packs.
 *
 * The engine is trade-neutral: qualify, quote, escalate, book, take a deposit.
 * What changes between a tattoo studio and a barber is the vocabulary, the
 * questions worth asking, the pick-lists, and the default service bands.
 *
 * Adding a trade means adding a pack here — no engine changes. If a trade needs
 * something a pack cannot express, that is a real gap in the core and worth
 * fixing there rather than special-casing.
 */

export type Vocabulary = {
  /** What the studio calls the person doing the work. */
  practitioner: string;
  practitioners: string;
  /** What the studio calls the work itself. */
  service: string;
  /** Past participle, for "what they want <tattooed>". */
  service_verb: string;
  /** What the size/duration bands are called. */
  size_unit: string;
  customer: string;
  /** What the business itself is called: studio, salon, shop, firm. */
  business: string;
};

export type QualificationField = {
  key: string;
  /** The question, as the assistant should think of it. */
  prompt: string;
  /** Column on `enquiries`, when this trade uses a standard one. */
  column?: "placement" | "description" | "size_band_id" | "style" | "cover_up";
  required: boolean;
};

export type VerticalPack = {
  id: string;
  label: string;
  vocabulary: Vocabulary;
  /** Whether an 18+ check is legally required before booking. */
  ageCheck: boolean;
  /** Extra hard rules, on top of the universal ones. */
  rules: string[];
  styles: { value: string; label: string }[];
  intents: { value: string; label: string }[];
  qualification: QualificationField[];
  bands: {
    size_label: string;
    hours_low: number;
    hours_high: number;
    requires_consultation: boolean;
  }[];
  faqs: { question: string; answer: string }[];
};

const TATTOO: VerticalPack = {
  id: "tattoo",
  label: "Tattoo studio",
  vocabulary: {
    practitioner: "artist",
    practitioners: "artists",
    service: "tattoo",
    service_verb: "tattooed",
    size_unit: "size",
    customer: "client",
    business: "studio",
  },
  ageCheck: true,
  rules: [
    "Never give medical advice. Healing problems, infections, skin conditions, medication, pregnancy, allergies — escalate to the owner. Do not offer an opinion first.",
    "Never book anyone under 18. UK law, no exceptions, no \"if a parent agrees\". If they are under 18 or will not confirm their age, escalate.",
  ],
  styles: [
    { value: "traditional", label: "Traditional" },
    { value: "fine_line", label: "Fine line" },
    { value: "realism", label: "Realism" },
    { value: "blackwork", label: "Blackwork" },
    { value: "script", label: "Script" },
    { value: "colour", label: "Colour" },
    { value: "black_and_grey", label: "Black and grey" },
    { value: "other", label: "Other" },
  ],
  intents: [
    { value: "new_tattoo", label: "New tattoo" },
    { value: "cover_up", label: "Cover-up" },
    { value: "touch_up", label: "Touch-up" },
    { value: "consultation", label: "Consultation only" },
    { value: "question", label: "General question" },
  ],
  qualification: [
    { key: "description", prompt: "What they want tattooed, in their own words", column: "description", required: true },
    { key: "placement", prompt: "Where on the body", column: "placement", required: true },
    { key: "size_band", prompt: "Roughly how big, using the size bands", column: "size_band_id", required: true },
    { key: "style", prompt: "Style", column: "style", required: false },
    { key: "cover_up", prompt: "Whether it covers an existing tattoo or scarring", column: "cover_up", required: false },
  ],
  bands: [
    { size_label: "Coin", hours_low: 0.5, hours_high: 1, requires_consultation: false },
    { size_label: "Palm", hours_low: 1, hours_high: 2, requires_consultation: false },
    { size_label: "Hand", hours_low: 2, hours_high: 3, requires_consultation: false },
    { size_label: "Forearm", hours_low: 3, hours_high: 5, requires_consultation: false },
    { size_label: "Half sleeve", hours_low: 6, hours_high: 12, requires_consultation: true },
    { size_label: "Full sleeve", hours_low: 15, hours_high: 30, requires_consultation: true },
    { size_label: "Back piece", hours_low: 25, hours_high: 50, requires_consultation: true },
  ],
  faqs: [
    { question: "Do you take walk-ins?", answer: "" },
    { question: "What is the aftercare?", answer: "" },
    { question: "Where can I park?", answer: "" },
  ],
};

/**
 * Second pack, kept deliberately thin. It exists to prove the seams are real —
 * a trade that needs something these fields cannot express is a gap in the
 * core, and better found now than after it is sold.
 *
 * Not finished: barbers price per service at a flat rate rather than by the
 * hour, which `price_bands` cannot express. That needs a second pricing model,
 * and it is worth designing against a real barber rather than guessing.
 */
const BARBER: VerticalPack = {
  id: "barber",
  label: "Barber shop",
  vocabulary: {
    practitioner: "barber",
    practitioners: "barbers",
    service: "cut",
    service_verb: "cut",
    size_unit: "service",
    customer: "customer",
    business: "shop",
  },
  ageCheck: false,
  rules: [
    "Never give medical advice about scalp or skin conditions. Escalate to the owner.",
  ],
  styles: [
    { value: "skin_fade", label: "Skin fade" },
    { value: "scissor_cut", label: "Scissor cut" },
    { value: "beard_trim", label: "Beard trim" },
    { value: "hot_towel_shave", label: "Hot towel shave" },
    { value: "other", label: "Other" },
  ],
  intents: [
    { value: "appointment", label: "Appointment" },
    { value: "consultation", label: "Consultation only" },
    { value: "question", label: "General question" },
  ],
  qualification: [
    { key: "description", prompt: "What they want done", column: "description", required: true },
    { key: "size_band", prompt: "Which service", column: "size_band_id", required: true },
    { key: "style", prompt: "Style", column: "style", required: false },
  ],
  bands: [
    { size_label: "Beard trim", hours_low: 0.25, hours_high: 0.5, requires_consultation: false },
    { size_label: "Cut", hours_low: 0.5, hours_high: 0.75, requires_consultation: false },
    { size_label: "Cut and beard", hours_low: 0.75, hours_high: 1, requires_consultation: false },
  ],
  faqs: [
    { question: "Do you take walk-ins?", answer: "" },
    { question: "Where can I park?", answer: "" },
  ],
};

export const VERTICALS: Record<string, VerticalPack> = {
  tattoo: TATTOO,
  barber: BARBER,
};

export const DEFAULT_VERTICAL = "tattoo";

export function verticalPack(id: string | null | undefined): VerticalPack {
  return VERTICALS[id ?? DEFAULT_VERTICAL] ?? TATTOO;
}
