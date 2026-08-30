/**
 * Vertical packs.
 *
 * The engine is trade-neutral: qualify, quote, escalate, book, take a deposit,
 * remind. What changes between a tattoo studio and a salon is the vocabulary,
 * the questions worth asking, the pick-lists, the default service bands and
 * what a reminder should say.
 *
 * Adding a trade is a pack here — no engine changes. If a trade needs something
 * a pack cannot express, that is a real gap in the core and worth fixing there
 * rather than special-casing.
 *
 * A pack is a starting point, not a straitjacket: everything it seeds is
 * editable per business afterwards, because no two studios work the same way.
 */

export type Vocabulary = {
  /** What the business calls the person doing the work. */
  practitioner: string;
  practitioners: string;
  /** What the business calls the work itself. */
  service: string;
  /** Past participle, for "what they want <tattooed>". */
  service_verb: string;
  /** What the size or duration bands are called. */
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

/**
 * What to send before an appointment. Trades differ enormously here — the
 * preparation for a tattoo, a colour treatment and a boiler service have
 * nothing in common, and a wrong reminder is worse than none.
 */
export type ReminderTemplate = {
  /** Hours before the appointment. */
  hours_before: number;
  label: string;
  body: string;
};

export type VerticalPack = {
  id: string;
  label: string;
  /** One line, shown when someone picks their trade at signup. */
  blurb: string;
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
  reminders: ReminderTemplate[];
};

// ---------------------------------------------------------------- tattoo

const TATTOO: VerticalPack = {
  id: "tattoo",
  label: "Tattoo studio",
  blurb: "Tattooing and piercing, priced by the hour.",
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
    'Never book anyone under 18. UK law, no exceptions, no "if a parent agrees". If they are under 18 or will not confirm their age, escalate.',
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
    { question: "What should I bring?", answer: "" },
  ],
  reminders: [
    {
      hours_before: 48,
      label: "Two days before",
      body:
        "Hi {{name}}, you're booked in with {{practitioner}} at {{business}} on {{when}}. " +
        "Bring photo ID — we can't tattoo without it. Have a proper meal beforehand and " +
        "go easy on the drink the night before, it makes a real difference. Need to move " +
        "it? Just reply here.",
    },
    {
      hours_before: 24,
      label: "The day before",
      body:
        "See you tomorrow, {{name}} — {{when}} with {{practitioner}}. Wear something that " +
        "gives easy access to the area. Reply here if anything's changed.",
    },
  ],
};

// ---------------------------------------------------------------- salon

const SALON: VerticalPack = {
  id: "salon",
  label: "Hair salon",
  blurb: "Hair and beauty, priced per service.",
  vocabulary: {
    practitioner: "stylist",
    practitioners: "stylists",
    service: "appointment",
    service_verb: "done",
    size_unit: "service",
    customer: "client",
    business: "salon",
  },
  ageCheck: false,
  rules: [
    "Never give medical advice about scalp or skin conditions, hair loss, or a reaction to a product. Escalate to the owner.",
    "Colour work needs a patch test at least 48 hours beforehand. If someone is new to the salon or has not had colour with us before, say so and let the salon confirm the timing.",
  ],
  styles: [
    { value: "cut_blow_dry", label: "Cut and blow dry" },
    { value: "colour", label: "Colour" },
    { value: "highlights", label: "Highlights" },
    { value: "balayage", label: "Balayage" },
    { value: "toner", label: "Toner or gloss" },
    { value: "treatment", label: "Treatment" },
    { value: "up_do", label: "Up-do or occasion" },
    { value: "extensions", label: "Extensions" },
    { value: "other", label: "Other" },
  ],
  intents: [
    { value: "appointment", label: "Appointment" },
    { value: "colour_change", label: "Colour change" },
    { value: "consultation", label: "Consultation only" },
    { value: "question", label: "General question" },
  ],
  qualification: [
    { key: "description", prompt: "What they want done, in their own words", column: "description", required: true },
    { key: "size_band", prompt: "Which service, from the list below", column: "size_band_id", required: true },
    { key: "style", prompt: "The kind of work — cut, colour, balayage", column: "style", required: false },
    { key: "cover_up", prompt: "Whether they have colour on their hair already, or it has been box-dyed", column: "cover_up", required: false },
  ],
  bands: [
    { size_label: "Fringe trim", hours_low: 0.25, hours_high: 0.25, requires_consultation: false },
    { size_label: "Cut and blow dry", hours_low: 1, hours_high: 1.25, requires_consultation: false },
    { size_label: "Roots and blow dry", hours_low: 1.5, hours_high: 2, requires_consultation: false },
    { size_label: "Half head highlights", hours_low: 2, hours_high: 2.5, requires_consultation: false },
    { size_label: "Full head highlights", hours_low: 2.5, hours_high: 3.5, requires_consultation: false },
    { size_label: "Balayage", hours_low: 3, hours_high: 4, requires_consultation: true },
    { size_label: "Colour correction", hours_low: 4, hours_high: 7, requires_consultation: true },
  ],
  faqs: [
    { question: "Do you take walk-ins?", answer: "" },
    { question: "Do I need a patch test?", answer: "" },
    { question: "Where can I park?", answer: "" },
    { question: "What if I need to cancel?", answer: "" },
  ],
  reminders: [
    {
      hours_before: 48,
      label: "Two days before",
      body:
        "Hi {{name}}, you're booked in with {{practitioner}} at {{business}} on {{when}}. " +
        "If you're having colour and haven't had a patch test with us in the last six " +
        "months, give us a shout — we'll need to sort one first. Reply here if you need " +
        "to move it.",
    },
    {
      hours_before: 24,
      label: "The day before",
      body:
        "See you tomorrow, {{name}} — {{when}} with {{practitioner}}. Come with dry, " +
        "unwashed hair if you're having colour. Reply here if anything's changed.",
    },
  ],
};

// ---------------------------------------------------------------- anything else

/**
 * The pack for a trade with no pack of its own.
 *
 * Deliberately plain. It exists so somebody can sign up on a Tuesday without
 * waiting for me to write their vertical, and so a new trade starts from
 * something honest rather than from tattoo defaults that make no sense to them.
 */
const GENERAL: VerticalPack = {
  id: "general",
  label: "Something else",
  blurb: "Any appointment-based business. Set your own services and wording.",
  vocabulary: {
    practitioner: "team member",
    practitioners: "team",
    service: "appointment",
    service_verb: "done",
    size_unit: "service",
    customer: "customer",
    business: "business",
  },
  ageCheck: false,
  rules: [
    "Never give medical, legal or financial advice. Escalate anything of that kind to the owner.",
  ],
  styles: [{ value: "other", label: "Other" }],
  intents: [
    { value: "appointment", label: "Appointment" },
    { value: "quote", label: "Quote" },
    { value: "consultation", label: "Consultation only" },
    { value: "question", label: "General question" },
  ],
  qualification: [
    { key: "description", prompt: "What they need, in their own words", column: "description", required: true },
    { key: "size_band", prompt: "Which service, from the list below", column: "size_band_id", required: true },
  ],
  bands: [
    { size_label: "Short appointment", hours_low: 0.5, hours_high: 0.5, requires_consultation: false },
    { size_label: "Standard appointment", hours_low: 1, hours_high: 1, requires_consultation: false },
    { size_label: "Long appointment", hours_low: 2, hours_high: 3, requires_consultation: false },
    { size_label: "Half day", hours_low: 4, hours_high: 4, requires_consultation: true },
  ],
  faqs: [
    { question: "Where can I park?", answer: "" },
    { question: "What if I need to cancel?", answer: "" },
  ],
  reminders: [
    {
      hours_before: 48,
      label: "Two days before",
      body:
        "Hi {{name}}, you're booked in with {{business}} on {{when}}. Reply here if you " +
        "need to move it.",
    },
    {
      hours_before: 24,
      label: "The day before",
      body: "See you tomorrow, {{name}} — {{when}}. Reply here if anything's changed.",
    },
  ],
};

export const VERTICALS: Record<string, VerticalPack> = {
  tattoo: TATTOO,
  salon: SALON,
  general: GENERAL,
};

/** In the order they are offered at signup. */
export const VERTICAL_LIST = [TATTOO, SALON, GENERAL];

export const DEFAULT_VERTICAL = "general";

export function verticalPack(id: string | null | undefined): VerticalPack {
  return VERTICALS[id ?? DEFAULT_VERTICAL] ?? GENERAL;
}
