/**
 * Trades.
 *
 * The engine is trade-neutral: qualify, quote, escalate, book, take a deposit,
 * remind. What changes between a tattoo studio, a salon and an electrician is
 * the vocabulary, the questions worth asking, the services, whether the work
 * happens at the customer's address, and what a reminder should say.
 *
 * Hand-writing a full pack per trade would be thousands of lines of the same
 * thing, so a trade is a short declaration and trade() fills in the rest.
 * Adding a trade really is a dozen lines here.
 *
 * A pack is a starting point, not a straitjacket: everything it seeds is
 * editable per business afterwards, because no two businesses work the same.
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

/** A row of `price_bands`, exactly as the seeder will insert it. */
export type ServiceBand = {
  size_label: string;
  hours_low: number;
  hours_high: number;
  requires_consultation: boolean;
  /** Set for flat-price trades. Null means "work it out from the hours". */
  price_low_pence: number | null;
  price_high_pence: number | null;
  duration_minutes: number | null;
};

export const TRADE_CATEGORIES = [
  "Trades and home",
  "Hair and beauty",
  "Health and wellbeing",
  "Pets",
  "Motoring",
  "Everything else",
] as const;

export type TradeCategory = (typeof TRADE_CATEGORIES)[number];

export type VerticalPack = {
  id: string;
  label: string;
  category: TradeCategory;
  /** One line, shown when someone picks their trade at signup. */
  blurb: string;
  /** Words someone might search for that are not in the label. */
  aliases: string[];
  /**
   * The first thing a customer reads in the chat window, before they have
   * typed anything. Trade-specific, because "what were you thinking of getting
   * done?" is a strange question to be asked by an electrician.
   */
  greeting: string;
  vocabulary: Vocabulary;
  /** Whether an 18+ check is legally required before booking. */
  ageCheck: boolean;
  /** What this trade normally does about deposits. The owner can change it. */
  deposits: "required" | "optional" | "none";
  /** Where the work happens. Seeds the travel settings. */
  location: "at_premises" | "at_customer" | "both";
  /** Whether services are timed and charged by the hour, or flat-priced. */
  pricing: "hourly" | "fixed";
  /** Extra hard rules, on top of the universal one. */
  rules: string[];
  styles: { value: string; label: string }[];
  intents: { value: string; label: string }[];
  qualification: QualificationField[];
  bands: ServiceBand[];
  faqs: { question: string; answer: string }[];
  reminders: ReminderTemplate[];
};

// --------------------------------------------------------------- the builder

type Svc = {
  /** Hourly trades: a range, or a single figure for a fixed length. */
  hours?: number | [number, number];
  /** Flat-price trades, in whole pounds. A range means "from and to". */
  price?: number | [number, number];
  /** How long to block in the diary, for flat-price work. */
  minutes?: number;
  /** Too variable to price over chat — look first. */
  consult?: boolean;
};

type TradeInput = {
  id: string;
  label: string;
  category: TradeCategory;
  blurb: string;
  greeting: string;
  aliases?: string[];
  words: Partial<Vocabulary>;
  ageCheck?: boolean;
  deposits?: VerticalPack["deposits"];
  location?: VerticalPack["location"];
  pricing?: VerticalPack["pricing"];
  rules?: string[];
  styles?: { value: string; label: string }[];
  intents?: { value: string; label: string }[];
  /** Extra questions, between "what do you need" and "which service". */
  asks?: QualificationField[];
  services: Record<string, Svc>;
  faqs?: string[];
  reminders?: ReminderTemplate[];
};

const UNIVERSAL_RULE =
  "Never give medical, legal or financial advice. Escalate anything of that kind to the owner.";

/** Fills in everything a trade did not bother to say. */
function trade(input: TradeInput): VerticalPack {
  const location = input.location ?? "at_premises";
  const pricing = input.pricing ?? "fixed";
  const travels = location !== "at_premises";

  const words: Vocabulary = {
    practitioner: "team member",
    practitioners: "team",
    service: "appointment",
    service_verb: "done",
    size_unit: "service",
    customer: "customer",
    business: "business",
    ...input.words,
  };

  // Every row carries every key. PostgREST sends an explicit NULL for a key
  // that only some rows in a batch have, which silently wipes the defaults.
  const bands: ServiceBand[] = Object.entries(input.services).map(([label, svc]) => {
    const hours = Array.isArray(svc.hours)
      ? svc.hours
      : svc.hours != null
        ? ([svc.hours, svc.hours] as [number, number])
        : null;
    const price = Array.isArray(svc.price)
      ? svc.price
      : svc.price != null
        ? ([svc.price, svc.price] as [number, number])
        : null;
    const minutes = svc.minutes ?? (hours ? Math.round(hours[0] * 60) : 60);

    return {
      size_label: label,
      hours_low: hours ? hours[0] : minutes / 60,
      hours_high: hours ? hours[1] : minutes / 60,
      requires_consultation: svc.consult ?? false,
      price_low_pence: price ? Math.round(price[0] * 100) : null,
      price_high_pence: price ? Math.round(price[1] * 100) : null,
      duration_minutes: minutes,
    };
  });

  const qualification: QualificationField[] = [
    {
      key: "description",
      prompt: "What they need, in their own words",
      column: "description",
      required: true,
    },
    ...(input.asks ?? []),
    {
      key: "size_band",
      prompt: "Which " + words.size_unit + ", from the list below",
      column: "size_band_id",
      required: true,
    },
  ];

  return {
    id: input.id,
    label: input.label,
    category: input.category,
    blurb: input.blurb,
    aliases: input.aliases ?? [],
    greeting: input.greeting,
    vocabulary: words,
    ageCheck: input.ageCheck ?? false,
    // Most trades invoice afterwards. Assuming otherwise made the product
    // unusable to them, so the safe default is to say nothing about money.
    deposits: input.deposits ?? "none",
    location,
    pricing,
    rules: [UNIVERSAL_RULE, ...(input.rules ?? [])],
    styles: input.styles ?? [],
    intents: input.intents ?? [
      { value: "appointment", label: "Appointment" },
      { value: "quote", label: "Quote" },
      { value: "question", label: "General question" },
    ],
    qualification,
    bands,
    faqs: (
      input.faqs ?? [
        travels ? "What areas do you cover?" : "Where can I park?",
        "How do I pay?",
        "What if I need to cancel?",
      ]
    ).map((question) => ({ question, answer: "" })),
    reminders: input.reminders ?? defaultReminders(travels),
  };
}

function defaultReminders(travels: boolean): ReminderTemplate[] {
  return [
    {
      hours_before: 48,
      label: "Two days before",
      body: travels
        ? "Hi {{name}}, {{practitioner}} from {{business}} is booked to come out to you {{when}}. " +
          "Please make sure there's somewhere to park and access to the work. Need to move it? Just reply here."
        : "Hi {{name}}, you're booked in with {{practitioner}} at {{business}} {{when}}. " +
          "Need to move it? Just reply here.",
    },
    {
      hours_before: 24,
      label: "The day before",
      body: travels
        ? "See you tomorrow, {{name}} — {{practitioner}} will be with you {{when}}. Reply here if anything's changed."
        : "See you tomorrow, {{name}} — {{when}} with {{practitioner}}. Reply here if anything's changed.",
    },
  ];
}

const JOB_ADDRESS: QualificationField = {
  key: "job_address",
  prompt: "Where the job is — the address, and the postcode especially",
  required: true,
};

// ═══════════════════════════════════════════════════ trades and home services
//
// Almost all of these share a shape: the work is at the customer's address,
// it is priced by the hour, and nobody takes a deposit.

const HOME: VerticalPack[] = [
  trade({
    id: "electrician",
    label: "Electrician",
    category: "Trades and home",
    blurb: "Domestic and commercial electrical work, at the customer's address.",
    aliases: ["sparky", "electrical", "rewire", "niceic", "consumer unit"],
    greeting: "Hi — what electrical work do you need doing?",
    words: {
      practitioner: "electrician",
      practitioners: "electricians",
      service: "job",
      size_unit: "job",
      business: "firm",
    },
    location: "at_customer",
    pricing: "hourly",
    asks: [JOB_ADDRESS],
    rules: [
      "Never advise anyone to touch, test or work on anything electrical themselves. If they describe burning, sparking, a smell, or repeated tripping, tell them to turn it off at the consumer unit and escalate immediately.",
    ],
    services: {
      "Call-out or small job": { hours: 1 },
      "Sockets, switches or lights": { hours: [1, 3] },
      "Fault finding": { hours: [1, 3] },
      "Consumer unit upgrade": { hours: 5, consult: true },
      "EICR safety certificate": { hours: [3, 4] },
      "EV charger installation": { hours: [4, 6], consult: true },
      "Full or partial rewire": { hours: [16, 40], consult: true },
    },
    faqs: [
      "What areas do you cover?",
      "Are you NICEIC registered?",
      "Do you give free quotes?",
      "How do I pay?",
    ],
  }),

  trade({
    id: "plumber",
    label: "Plumber",
    category: "Trades and home",
    blurb: "Plumbing repairs and installation, at the customer's address.",
    aliases: ["plumbing", "leak", "bathroom", "tap", "blockage"],
    greeting: "Hi — what's the plumbing problem?",
    words: {
      practitioner: "plumber",
      practitioners: "plumbers",
      service: "job",
      size_unit: "job",
      business: "firm",
    },
    location: "at_customer",
    pricing: "hourly",
    asks: [JOB_ADDRESS],
    rules: [
      "If they describe water actively escaping — a burst pipe, a ceiling coming down, water near electrics — tell them where the stopcock usually is, that they should turn the water off, and escalate immediately. Do not put them in a booking queue.",
    ],
    services: {
      "Call-out or small repair": { hours: 1 },
      "Leak or blockage": { hours: [1, 3] },
      "Tap, toilet or radiator swap": { hours: [1, 2] },
      "Outside tap": { hours: 2 },
      "Bathroom refit": { hours: [24, 40], consult: true },
      "Full re-pipe": { hours: [16, 32], consult: true },
    },
    faqs: [
      "What areas do you cover?",
      "Do you charge a call-out fee?",
      "Do you do emergencies?",
      "How do I pay?",
    ],
  }),

  trade({
    id: "gas_heating",
    label: "Heating and gas engineer",
    category: "Trades and home",
    blurb: "Boilers, servicing and gas work. Gas Safe registered.",
    aliases: ["boiler", "gas safe", "heating", "central heating", "landlord certificate"],
    greeting: "Hi — is this about a boiler, a service, or something else?",
    words: {
      practitioner: "engineer",
      practitioners: "engineers",
      service: "job",
      size_unit: "job",
      business: "firm",
    },
    location: "at_customer",
    pricing: "hourly",
    asks: [JOB_ADDRESS],
    rules: [
      "If anyone mentions the smell of gas, tell them to open the windows, not touch any switches, leave the property and ring the National Gas Emergency Service on 0800 111 999. Escalate immediately. Never book this in as an appointment.",
      "If anyone mentions a carbon monoxide alarm going off, or feeling unwell with headaches near the boiler, give the same advice and escalate.",
    ],
    services: {
      "Boiler service": { hours: 1 },
      "Landlord gas safety certificate": { hours: 1 },
      "Boiler repair": { hours: [1, 3] },
      "Radiator or valve work": { hours: [1, 3] },
      "Power flush": { hours: [4, 6] },
      "New boiler installation": { hours: [8, 16], consult: true },
    },
    faqs: [
      "What areas do you cover?",
      "Are you Gas Safe registered?",
      "Do you do landlord certificates?",
      "How do I pay?",
    ],
  }),

  trade({
    id: "joiner",
    label: "Joiner or carpenter",
    category: "Trades and home",
    blurb: "Doors, floors, fitted furniture and general woodwork.",
    aliases: ["carpenter", "chippy", "wood", "kitchen fitting", "door", "flooring"],
    greeting: "Hi — what are you looking to have made or fitted?",
    words: {
      practitioner: "joiner",
      practitioners: "joiners",
      service: "job",
      size_unit: "job",
      business: "firm",
    },
    location: "at_customer",
    pricing: "hourly",
    asks: [JOB_ADDRESS],
    services: {
      "Small repair or adjustment": { hours: [1, 2] },
      "Doors hung": { hours: [1, 3] },
      "Skirting and architrave": { hours: [4, 8] },
      Flooring: { hours: [6, 16], consult: true },
      "Fitted wardrobes or shelving": { hours: [8, 24], consult: true },
      "Kitchen fitting": { hours: [16, 40], consult: true },
    },
  }),

  trade({
    id: "decorator",
    label: "Painter and decorator",
    category: "Trades and home",
    blurb: "Interior and exterior painting and decorating.",
    aliases: ["painter", "painting", "decorating", "wallpaper"],
    greeting: "Hi — what are you looking to have decorated?",
    words: {
      practitioner: "decorator",
      practitioners: "decorators",
      service: "job",
      size_unit: "job",
      business: "firm",
    },
    location: "at_customer",
    pricing: "hourly",
    asks: [JOB_ADDRESS],
    services: {
      "Single room": { hours: [8, 16] },
      "Hall, stairs and landing": { hours: [16, 24], consult: true },
      "Whole house interior": { hours: [40, 80], consult: true },
      Exterior: { hours: [24, 48], consult: true },
      Wallpapering: { hours: [8, 16], consult: true },
    },
  }),

  trade({
    id: "plasterer",
    label: "Plasterer",
    category: "Trades and home",
    blurb: "Skimming, rendering and plaster repairs.",
    aliases: ["plastering", "skim", "render", "artex", "boarding"],
    greeting: "Hi — what needs plastering?",
    words: {
      practitioner: "plasterer",
      practitioners: "plasterers",
      service: "job",
      size_unit: "job",
      business: "firm",
    },
    location: "at_customer",
    pricing: "hourly",
    asks: [JOB_ADDRESS],
    services: {
      "Patch repair": { hours: [2, 4] },
      "Skim one ceiling": { hours: [4, 6] },
      "Skim one room": { hours: [8, 14] },
      "Board and skim": { hours: [12, 20], consult: true },
      "External rendering": { hours: [24, 48], consult: true },
    },
  }),

  trade({
    id: "roofer",
    label: "Roofer",
    category: "Trades and home",
    blurb: "Roof repairs, replacement, guttering and flat roofs.",
    aliases: ["roofing", "gutter", "tiles", "flat roof", "leak"],
    greeting: "Hi — what's happening with the roof?",
    words: {
      practitioner: "roofer",
      practitioners: "roofers",
      service: "job",
      size_unit: "job",
      business: "firm",
    },
    location: "at_customer",
    pricing: "hourly",
    asks: [JOB_ADDRESS],
    services: {
      "Inspection and quote": { hours: 1 },
      "Tile or slate repair": { hours: [2, 5] },
      "Gutter clearing or repair": { hours: [2, 4] },
      "Flat roof replacement": { hours: [16, 32], consult: true },
      "Full re-roof": { hours: [40, 100], consult: true },
    },
  }),

  trade({
    id: "handyman",
    label: "Handyman",
    category: "Trades and home",
    blurb: "The small jobs nobody else will come out for.",
    aliases: ["odd jobs", "maintenance", "flat pack", "diy", "property maintenance"],
    greeting: "Hi — what have you got that needs doing?",
    words: {
      practitioner: "handyman",
      practitioners: "team",
      service: "job",
      size_unit: "job",
      business: "firm",
    },
    location: "at_customer",
    pricing: "hourly",
    asks: [JOB_ADDRESS],
    services: {
      "One hour": { hours: 1 },
      "Half day": { hours: 4 },
      "Full day": { hours: 8 },
      "Flat-pack assembly": { hours: [1, 3] },
      "Shelves, blinds and mounting": { hours: [1, 3] },
    },
  }),

  trade({
    id: "locksmith",
    label: "Locksmith",
    category: "Trades and home",
    blurb: "Lockouts, lock changes and security upgrades.",
    aliases: ["locks", "locked out", "upvc", "security", "burglary repair"],
    greeting: "Hi — are you locked out right now, or is this something to book in?",
    words: {
      practitioner: "locksmith",
      practitioners: "locksmiths",
      service: "job",
      size_unit: "job",
      business: "firm",
    },
    location: "at_customer",
    asks: [JOB_ADDRESS],
    rules: [
      "If someone is locked out right now, in the cold, or with a child or pet inside, do not put them through a booking flow. Escalate straight away.",
      "Never discuss how to open a lock, defeat one, or gain entry to anything. If asked, decline and escalate.",
    ],
    services: {
      "Lockout entry": { price: [60, 90], minutes: 45 },
      "Lock change": { price: [80, 140], minutes: 60 },
      "uPVC door mechanism": { price: [120, 200], minutes: 90 },
      "Security survey": { price: 0, minutes: 45, consult: true },
    },
  }),

  trade({
    id: "gardener",
    label: "Gardener or landscaper",
    category: "Trades and home",
    blurb: "Garden maintenance, one-off tidies and landscaping.",
    aliases: ["garden", "landscaping", "lawn", "hedge", "grass", "clearance"],
    greeting: "Hi — is this a regular tidy, a one-off, or a bigger project?",
    words: {
      practitioner: "gardener",
      practitioners: "gardeners",
      service: "visit",
      size_unit: "job",
      business: "firm",
    },
    location: "at_customer",
    pricing: "hourly",
    asks: [JOB_ADDRESS],
    services: {
      "Regular maintenance visit": { hours: 2 },
      "One-off tidy": { hours: [3, 6] },
      "Hedge cutting": { hours: [2, 6] },
      Clearance: { hours: [6, 16], consult: true },
      "Landscaping project": { hours: [24, 80], consult: true },
    },
  }),

  trade({
    id: "cleaner",
    label: "Cleaner",
    category: "Trades and home",
    blurb: "Domestic, deep and end-of-tenancy cleaning.",
    aliases: ["cleaning", "housekeeping", "end of tenancy", "deep clean", "domestic"],
    greeting: "Hi — is this a regular clean or a one-off?",
    words: {
      practitioner: "cleaner",
      practitioners: "cleaners",
      service: "clean",
      size_unit: "clean",
      business: "firm",
    },
    location: "at_customer",
    pricing: "hourly",
    asks: [JOB_ADDRESS],
    services: {
      "Regular clean": { hours: [2, 3] },
      "One-off clean": { hours: [3, 5] },
      "Deep clean": { hours: [5, 8] },
      "End of tenancy": { hours: [6, 10], consult: true },
      "After builders": { hours: [6, 12], consult: true },
    },
  }),
];

// ═══════════════════════════════════════════════════════════ hair and beauty

const TATTOO = trade({
  id: "tattoo",
  label: "Tattoo studio",
  category: "Hair and beauty",
  blurb: "Tattooing and piercing, priced by the hour.",
  aliases: ["tattooist", "ink", "piercing", "body art", "cover up"],
  greeting: "Hi — what were you thinking of getting done?",
  words: {
    practitioner: "artist",
    practitioners: "artists",
    service: "tattoo",
    service_verb: "tattooed",
    size_unit: "size",
    customer: "client",
    business: "studio",
  },
  ageCheck: true,
  // Tattooing runs on deposits; a no-show is hours of an artist's day gone.
  deposits: "required",
  pricing: "hourly",
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
  asks: [
    { key: "placement", prompt: "Where on the body", column: "placement", required: true },
    { key: "style", prompt: "Style", column: "style", required: false },
    {
      key: "cover_up",
      prompt: "Whether it covers an existing tattoo or scarring",
      column: "cover_up",
      required: false,
    },
  ],
  services: {
    Coin: { hours: [0.5, 1] },
    Palm: { hours: [1, 2] },
    Hand: { hours: [2, 3] },
    Forearm: { hours: [3, 5] },
    "Half sleeve": { hours: [6, 12], consult: true },
    "Full sleeve": { hours: [15, 30], consult: true },
    "Back piece": { hours: [25, 50], consult: true },
  },
  faqs: [
    "Do you take walk-ins?",
    "What is the aftercare?",
    "Where can I park?",
    "What should I bring?",
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
});

const BEAUTY: VerticalPack[] = [
  TATTOO,

  trade({
    id: "salon",
    label: "Hair salon",
    category: "Hair and beauty",
    blurb: "Cutting, colouring and treatments, priced per service.",
    aliases: ["hairdresser", "hair", "colourist", "stylist", "balayage"],
    greeting: "Hi — what were you after? Cut, colour, something else?",
    words: {
      practitioner: "stylist",
      practitioners: "stylists",
      service: "appointment",
      service_verb: "done",
      size_unit: "service",
      customer: "client",
      business: "salon",
    },
    deposits: "optional",
    rules: [
      "Never advise on scalp conditions, hair loss, allergies or reactions. Escalate to the salon.",
      "Anyone who has not had a colour with the salon before needs a patch test at least 48 hours ahead. Say so before offering colour times.",
    ],
    styles: [
      { value: "cut", label: "Cut" },
      { value: "colour", label: "Colour" },
      { value: "highlights", label: "Highlights" },
      { value: "balayage", label: "Balayage" },
      { value: "treatment", label: "Treatment" },
      { value: "extensions", label: "Extensions" },
      { value: "up_do", label: "Up-do" },
    ],
    intents: [
      { value: "appointment", label: "Appointment" },
      { value: "consultation", label: "Consultation" },
      { value: "question", label: "General question" },
    ],
    services: {
      "Cut and finish": { price: 45, minutes: 45 },
      Restyle: { price: 60, minutes: 60 },
      "Root tint": { price: 55, minutes: 90 },
      "Half head highlights": { price: 85, minutes: 120 },
      "Full head highlights": { price: 110, minutes: 180 },
      Balayage: { price: [120, 180], minutes: 210, consult: true },
      "Blow dry": { price: 28, minutes: 30 },
      Treatment: { price: 25, minutes: 30 },
    },
    faqs: [
      "Do I need a patch test?",
      "Where can I park?",
      "Do you do a consultation first?",
      "What if I need to cancel?",
    ],
    reminders: [
      {
        hours_before: 48,
        label: "Two days before",
        body:
          "Hi {{name}}, you're booked in with {{practitioner}} at {{business}} {{when}}. " +
          "Come with dry, unwashed hair if you're having colour. Need to move it? Just reply here.",
      },
      {
        hours_before: 24,
        label: "The day before",
        body:
          "See you tomorrow, {{name}} — {{when}} with {{practitioner}}. Reply here if anything's changed.",
      },
    ],
  }),

  trade({
    id: "mobile_hair",
    label: "Mobile hairdresser",
    category: "Hair and beauty",
    blurb: "Hairdressing at the client's home.",
    aliases: ["mobile hair", "home hairdresser", "visiting stylist", "freelance hair"],
    greeting: "Hi — what were you after, and whereabouts are you?",
    words: {
      practitioner: "stylist",
      practitioners: "stylists",
      service: "appointment",
      size_unit: "service",
      customer: "client",
      business: "business",
    },
    location: "at_customer",
    asks: [JOB_ADDRESS],
    rules: [
      "Anyone who has not had a colour before needs a patch test at least 48 hours ahead. Say so before offering colour times.",
    ],
    services: {
      "Cut and finish": { price: 35, minutes: 45 },
      "Cut, over 60s": { price: 25, minutes: 40 },
      "Children's cut": { price: 18, minutes: 30 },
      "Root tint": { price: 50, minutes: 90 },
      "Blow dry": { price: 25, minutes: 30 },
      "Wedding or occasion hair": { price: [60, 120], minutes: 90, consult: true },
    },
  }),

  trade({
    id: "barber",
    label: "Barber",
    category: "Hair and beauty",
    blurb: "Appointment-based barbering.",
    aliases: ["barbers", "mens hair", "beard", "fade", "shave"],
    greeting: "Hi — what are you after, and when suits?",
    words: {
      practitioner: "barber",
      practitioners: "barbers",
      service: "cut",
      size_unit: "service",
      customer: "client",
      business: "shop",
    },
    services: {
      "Skin fade": { price: 18, minutes: 30 },
      Cut: { price: 15, minutes: 30 },
      "Cut and beard": { price: 22, minutes: 45 },
      "Beard trim": { price: 10, minutes: 15 },
      "Hot towel shave": { price: 25, minutes: 45 },
      "Children's cut": { price: 12, minutes: 20 },
    },
  }),

  trade({
    id: "beautician",
    label: "Beauty salon",
    category: "Hair and beauty",
    blurb: "Facials, waxing, brows, lashes and treatments.",
    aliases: ["beauty", "facial", "waxing", "brows", "lashes", "spray tan", "therapist"],
    greeting: "Hi — which treatment were you after?",
    words: {
      practitioner: "therapist",
      practitioners: "therapists",
      service: "treatment",
      size_unit: "treatment",
      customer: "client",
      business: "salon",
    },
    deposits: "optional",
    rules: [
      "Never advise on skin conditions, reactions, allergies or anything medical. Escalate to the salon.",
      "Some treatments need a patch test 24 to 48 hours ahead. If in doubt, say a patch test may be needed and let the salon confirm.",
    ],
    services: {
      "Brow shape": { price: 15, minutes: 20 },
      "Lash lift": { price: 40, minutes: 60 },
      "Classic lash extensions": { price: 55, minutes: 90 },
      Facial: { price: 45, minutes: 60 },
      "Full leg wax": { price: 32, minutes: 45 },
      "Spray tan": { price: 25, minutes: 30 },
    },
  }),

  trade({
    id: "nails",
    label: "Nail technician",
    category: "Hair and beauty",
    blurb: "Manicures, gel, acrylics and nail art.",
    aliases: ["nails", "gel", "acrylic", "manicure", "pedicure", "infill"],
    greeting: "Hi — what were you after? Gel, acrylics, or something else?",
    words: {
      practitioner: "technician",
      practitioners: "technicians",
      service: "set",
      size_unit: "treatment",
      customer: "client",
      business: "salon",
    },
    deposits: "optional",
    services: {
      "Gel manicure": { price: 30, minutes: 60 },
      "Acrylic full set": { price: 45, minutes: 90 },
      Infill: { price: 32, minutes: 60 },
      "Removal and tidy": { price: 15, minutes: 30 },
      Pedicure: { price: 35, minutes: 60 },
      "Nail art": { price: [5, 25], minutes: 20 },
    },
  }),

  trade({
    id: "aesthetics",
    label: "Aesthetics clinic",
    category: "Hair and beauty",
    blurb: "Injectables and advanced skin treatments.",
    aliases: ["injectables", "botox", "filler", "skin clinic", "cosmetic", "anti wrinkle"],
    greeting: "Hi — which treatment are you interested in?",
    words: {
      practitioner: "practitioner",
      practitioners: "practitioners",
      service: "treatment",
      size_unit: "treatment",
      customer: "client",
      business: "clinic",
    },
    ageCheck: true,
    deposits: "required",
    rules: [
      "Never discuss outcomes, dosages, risks, suitability, or anything about a named product. Every clinical question goes to the practitioner. This is not a topic to be helpful about.",
      "Never book anyone under 18 for any injectable treatment. UK law. If they are under 18 or will not confirm, escalate.",
      "Everyone needs a consultation with the practitioner before a first treatment. Book the consultation, never the treatment.",
    ],
    services: {
      Consultation: { price: 0, minutes: 30, consult: true },
      "Anti-wrinkle, one area": { price: 120, minutes: 30, consult: true },
      "Anti-wrinkle, three areas": { price: 220, minutes: 45, consult: true },
      "Dermal filler": { price: [180, 350], minutes: 60, consult: true },
      "Skin peel": { price: 90, minutes: 45, consult: true },
    },
  }),

  trade({
    id: "massage",
    label: "Massage therapist",
    category: "Hair and beauty",
    blurb: "Massage and bodywork.",
    aliases: ["massage", "sports massage", "deep tissue", "relaxation", "hot stone"],
    greeting: "Hi — what kind of massage were you after?",
    words: {
      practitioner: "therapist",
      practitioners: "therapists",
      service: "treatment",
      size_unit: "treatment",
      customer: "client",
      business: "practice",
    },
    location: "both",
    rules: [
      "Never diagnose anything or advise on an injury. If they describe pain, an injury or a medical condition, say the therapist will go through it with them and escalate.",
    ],
    services: {
      "30 minutes": { price: 35, minutes: 30 },
      "60 minutes": { price: 55, minutes: 60 },
      "90 minutes": { price: 75, minutes: 90 },
      "Sports massage": { price: 60, minutes: 60 },
      "Hot stone": { price: 70, minutes: 75 },
    },
  }),
];

// ═══════════════════════════════════════════════════════ health and wellbeing
//
// These share a hard rule that matters more than anything else in this file:
// the assistant does not do clinical talk, at all, ever.

const CLINICAL_RULES = [
  "Never diagnose, never advise on treatment, never say whether something sounds serious or not. Anything clinical goes to the practitioner. Book them in and let a human deal with it.",
  "If anyone describes chest pain, difficulty breathing, numbness, loss of movement, a head injury, or anything that sounds like an emergency, tell them to ring 999 or NHS 111 and escalate immediately. Do not offer an appointment.",
];

const HEALTH: VerticalPack[] = [
  trade({
    id: "physio",
    label: "Physiotherapist",
    category: "Health and wellbeing",
    blurb: "Physiotherapy assessment and treatment.",
    aliases: ["physio", "rehab", "injury", "sports injury", "back"],
    greeting: "Hi — is this a new problem, or a follow-up?",
    words: {
      practitioner: "physiotherapist",
      practitioners: "physiotherapists",
      service: "appointment",
      size_unit: "appointment",
      customer: "patient",
      business: "clinic",
    },
    rules: CLINICAL_RULES,
    intents: [
      { value: "new", label: "New problem" },
      { value: "follow_up", label: "Follow-up" },
      { value: "question", label: "General question" },
    ],
    services: {
      "Initial assessment": { price: 60, minutes: 60 },
      "Follow-up": { price: 45, minutes: 30 },
      "Extended follow-up": { price: 60, minutes: 45 },
      "Sports massage": { price: 50, minutes: 45 },
    },
  }),

  trade({
    id: "chiro",
    label: "Chiropractor or osteopath",
    category: "Health and wellbeing",
    blurb: "Manual therapy for backs, necks and joints.",
    aliases: ["chiropractor", "osteopath", "back pain", "spine", "manual therapy"],
    greeting: "Hi — is this your first visit with us?",
    words: {
      practitioner: "practitioner",
      practitioners: "practitioners",
      service: "appointment",
      size_unit: "appointment",
      customer: "patient",
      business: "clinic",
    },
    rules: CLINICAL_RULES,
    services: {
      "Initial consultation and treatment": { price: 65, minutes: 60 },
      "Follow-up treatment": { price: 45, minutes: 30 },
      Review: { price: 40, minutes: 30 },
    },
  }),

  trade({
    id: "pt",
    label: "Personal trainer",
    category: "Health and wellbeing",
    blurb: "One-to-one and small group training.",
    aliases: ["personal training", "pt", "fitness", "gym", "coach", "strength"],
    greeting: "Hi — what are you looking to work on?",
    words: {
      practitioner: "trainer",
      practitioners: "trainers",
      service: "session",
      size_unit: "session",
      customer: "client",
      business: "business",
    },
    location: "both",
    rules: [
      "Never give nutritional, medical or injury advice. If they mention an injury or a health condition, say the trainer will go through it properly and escalate.",
    ],
    services: {
      "Taster session": { price: 0, minutes: 45, consult: true },
      "Single session": { price: 40, minutes: 60 },
      "Block of six": { price: 210, minutes: 60 },
      "Block of twelve": { price: 400, minutes: 60 },
      "Small group": { price: 15, minutes: 60 },
    },
  }),

  trade({
    id: "counsellor",
    label: "Counsellor or therapist",
    category: "Health and wellbeing",
    blurb: "Talking therapy, in person or online.",
    aliases: ["counselling", "therapy", "psychotherapist", "cbt", "mental health"],
    greeting: "Hi — would you like to book an initial call?",
    words: {
      practitioner: "therapist",
      practitioners: "therapists",
      service: "session",
      size_unit: "session",
      customer: "client",
      business: "practice",
    },
    rules: [
      "This is the most sensitive setting in the product. Do not ask what someone wants to talk about, do not ask for any detail about their situation, and do not respond to anything they disclose beyond acknowledging it warmly and briefly.",
      "If anyone mentions self-harm, suicide, abuse, or being unsafe, do not continue the booking flow. Tell them plainly that Samaritans are on 116 123, free, day or night, and that if they are in immediate danger they should ring 999. Escalate immediately.",
      "Take only a name, a way to contact them, and when suits. Nothing else.",
    ],
    intents: [
      { value: "initial", label: "Initial call" },
      { value: "session", label: "Booking a session" },
      { value: "question", label: "General question" },
    ],
    services: {
      "Free initial call": { price: 0, minutes: 20 },
      Session: { price: 55, minutes: 50 },
      "Couples session": { price: 80, minutes: 60 },
    },
    faqs: [
      "Do you offer online sessions?",
      "How many sessions will I need?",
      "Is it confidential?",
      "What if I need to cancel?",
    ],
  }),

  trade({
    id: "podiatrist",
    label: "Podiatrist or chiropodist",
    category: "Health and wellbeing",
    blurb: "Foot health, nail care and biomechanics.",
    aliases: ["chiropodist", "feet", "foot", "toenails", "orthotics", "verruca"],
    greeting: "Hi — is this a routine appointment or a specific problem?",
    words: {
      practitioner: "podiatrist",
      practitioners: "podiatrists",
      service: "appointment",
      size_unit: "appointment",
      customer: "patient",
      business: "clinic",
    },
    location: "both",
    rules: CLINICAL_RULES,
    services: {
      "Routine treatment": { price: 40, minutes: 30 },
      "Initial assessment": { price: 55, minutes: 45 },
      "Nail surgery": { price: 250, minutes: 60, consult: true },
      "Biomechanical assessment": { price: 90, minutes: 60 },
    },
  }),
];

// ══════════════════════════════════════════════════════════════════════ pets

const PETS: VerticalPack[] = [
  trade({
    id: "dog_groomer",
    label: "Dog groomer",
    category: "Pets",
    blurb: "Grooming, priced by breed and coat.",
    aliases: ["grooming", "dog", "pet grooming", "clip", "wash", "de-matting"],
    greeting: "Hi — what breed is your dog, and what were you after?",
    words: {
      practitioner: "groomer",
      practitioners: "groomers",
      service: "groom",
      size_unit: "groom",
      customer: "owner",
      business: "salon",
    },
    deposits: "optional",
    rules: [
      "Never give veterinary advice. If they mention lumps, skin problems, injuries, or a dog being unwell, say they should speak to their vet and escalate.",
      "Always ask whether the dog is nervous, has bitten before, or has any special needs. The groomer needs to know before the dog arrives.",
    ],
    asks: [
      { key: "breed", prompt: "The breed, and the dog's name", required: true },
      {
        key: "temperament",
        prompt: "Whether the dog is nervous or has any special needs",
        required: false,
      },
    ],
    intents: [
      { value: "full_groom", label: "Full groom" },
      { value: "bath", label: "Bath and tidy" },
      { value: "puppy", label: "Puppy's first groom" },
      { value: "question", label: "General question" },
    ],
    services: {
      "Small breed full groom": { price: 35, minutes: 90 },
      "Medium breed full groom": { price: 45, minutes: 120 },
      "Large breed full groom": { price: 60, minutes: 150 },
      "Bath and blow dry": { price: 25, minutes: 60 },
      "Puppy introduction": { price: 20, minutes: 45 },
      "De-matting": { price: [10, 40], minutes: 60, consult: true },
    },
    faqs: [
      "Do you need to see a vaccination card?",
      "How long will it take?",
      "Where can I park?",
      "What if my dog is nervous?",
    ],
  }),

  trade({
    id: "dog_walker",
    label: "Dog walker or pet sitter",
    category: "Pets",
    blurb: "Walks, visits and sitting, at the owner's home.",
    aliases: ["dog walking", "pet sitting", "cat sitting", "boarding", "puppy visits"],
    greeting: "Hi — what are you after, and whereabouts are you?",
    words: {
      practitioner: "walker",
      practitioners: "walkers",
      service: "walk",
      size_unit: "service",
      customer: "owner",
      business: "business",
    },
    location: "at_customer",
    asks: [
      JOB_ADDRESS,
      { key: "pet", prompt: "The pet's name, breed and anything to know", required: true },
    ],
    services: {
      "Solo walk, 30 minutes": { price: 12, minutes: 30 },
      "Solo walk, 60 minutes": { price: 18, minutes: 60 },
      "Group walk": { price: 12, minutes: 60 },
      "Home visit": { price: 12, minutes: 30 },
      "Overnight sitting": { price: 45, minutes: 720, consult: true },
    },
  }),
];

// ══════════════════════════════════════════════════════════════════ motoring

const MOTORING: VerticalPack[] = [
  trade({
    id: "mobile_mechanic",
    label: "Mobile mechanic",
    category: "Motoring",
    blurb: "Servicing and repairs at the customer's address.",
    aliases: ["mechanic", "car repair", "servicing", "mobile car", "diagnostics"],
    greeting: "Hi — what's the car doing, and whereabouts are you?",
    words: {
      practitioner: "mechanic",
      practitioners: "mechanics",
      service: "job",
      size_unit: "job",
      business: "business",
    },
    location: "at_customer",
    pricing: "hourly",
    asks: [
      JOB_ADDRESS,
      { key: "vehicle", prompt: "Make, model, year and registration", required: true },
    ],
    rules: [
      "If they describe brake failure, steering problems, smoke, or anything that makes the car unsafe, tell them not to drive it and escalate.",
    ],
    services: {
      Diagnostic: { hours: 1 },
      "Interim service": { hours: 1.5 },
      "Full service": { hours: 2.5 },
      Brakes: { hours: [1.5, 3] },
      "Battery or alternator": { hours: [1, 2] },
      "Clutch or cambelt": { hours: [4, 8], consult: true },
    },
  }),

  trade({
    id: "garage",
    label: "Garage or MOT centre",
    category: "Motoring",
    blurb: "Servicing, MOTs and repairs at the workshop.",
    aliases: ["mot", "garage", "servicing", "car", "workshop", "repairs"],
    greeting: "Hi — is this for an MOT, a service, or a repair?",
    words: {
      practitioner: "technician",
      practitioners: "technicians",
      service: "job",
      size_unit: "job",
      business: "garage",
    },
    asks: [{ key: "vehicle", prompt: "Make, model, year and registration", required: true }],
    intents: [
      { value: "mot", label: "MOT" },
      { value: "service", label: "Service" },
      { value: "repair", label: "Repair" },
      { value: "question", label: "General question" },
    ],
    services: {
      MOT: { price: 55, minutes: 60 },
      "MOT and interim service": { price: 145, minutes: 120 },
      "Interim service": { price: 110, minutes: 90 },
      "Full service": { price: 180, minutes: 180 },
      Diagnostic: { price: 50, minutes: 60 },
      Repair: { price: 0, minutes: 120, consult: true },
    },
  }),

  trade({
    id: "valeting",
    label: "Car valeting or detailing",
    category: "Motoring",
    blurb: "Cleaning and detailing, at the customer's address or the unit.",
    aliases: ["valet", "detailing", "car cleaning", "ceramic", "polish"],
    greeting: "Hi — which valet were you after, and whereabouts is the car?",
    words: {
      practitioner: "valeter",
      practitioners: "valeters",
      service: "valet",
      size_unit: "valet",
      business: "business",
    },
    location: "both",
    asks: [{ key: "vehicle", prompt: "Make, model and size of the vehicle", required: true }],
    services: {
      "Exterior wash": { price: 25, minutes: 60 },
      "Full valet": { price: 65, minutes: 180 },
      "Interior deep clean": { price: 80, minutes: 210 },
      "Machine polish": { price: 180, minutes: 360, consult: true },
      "Ceramic coating": { price: [350, 700], minutes: 480, consult: true },
    },
  }),

  trade({
    id: "driving_instructor",
    label: "Driving instructor",
    category: "Motoring",
    blurb: "Driving lessons, picked up from the pupil's address.",
    aliases: ["driving lessons", "adi", "instructor", "learner", "test"],
    greeting: "Hi — have you driven before, or are you starting from scratch?",
    words: {
      practitioner: "instructor",
      practitioners: "instructors",
      service: "lesson",
      size_unit: "lesson",
      customer: "pupil",
      business: "school",
    },
    location: "at_customer",
    asks: [
      { key: "pickup", prompt: "Where they want picking up from", required: true },
      { key: "licence", prompt: "Whether they have a provisional licence yet", required: true },
    ],
    rules: [
      "Never book anyone without a provisional licence. If they have not got one, tell them to apply on gov.uk first and that we will pick it up from there.",
    ],
    services: {
      "First lesson": { price: 30, minutes: 60 },
      "Single lesson": { price: 35, minutes: 60 },
      "Two-hour lesson": { price: 68, minutes: 120 },
      "Block of ten": { price: 330, minutes: 60 },
      "Motorway lesson": { price: 68, minutes: 120 },
    },
  }),
];

// ═══════════════════════════════════════════════════════════ everything else

const GENERAL = trade({
  id: "general",
  label: "Something else",
  category: "Everything else",
  blurb: "Any appointment-based business. Set your own services and wording.",
  aliases: ["other", "general", "custom"],
  greeting: "Hi — what can we help you with?",
  words: {},
  location: "both",
  services: {
    "Short appointment": { minutes: 30 },
    "Standard appointment": { minutes: 60 },
    "Long appointment": { minutes: 120 },
    "Half day": { minutes: 240, consult: true },
  },
});

const OTHER: VerticalPack[] = [
  trade({
    id: "photographer",
    label: "Photographer",
    category: "Everything else",
    blurb: "Shoots, sessions and events.",
    aliases: ["photography", "photos", "wedding", "portrait", "shoot"],
    greeting: "Hi — what sort of shoot were you thinking about?",
    words: {
      practitioner: "photographer",
      practitioners: "photographers",
      service: "shoot",
      size_unit: "package",
      customer: "client",
      business: "studio",
    },
    location: "both",
    deposits: "required",
    services: {
      "Mini session": { price: 120, minutes: 45 },
      "Portrait session": { price: 250, minutes: 120 },
      "Family session": { price: 280, minutes: 120 },
      "Event, half day": { price: 550, minutes: 240, consult: true },
      Wedding: { price: [1200, 2500], minutes: 600, consult: true },
    },
  }),

  trade({
    id: "tutor",
    label: "Tutor",
    category: "Everything else",
    blurb: "One-to-one tuition, online or in person.",
    aliases: ["tuition", "teaching", "maths", "gcse", "a level", "lessons"],
    greeting: "Hi — which subject and what level?",
    words: {
      practitioner: "tutor",
      practitioners: "tutors",
      service: "lesson",
      size_unit: "lesson",
      customer: "student",
      business: "practice",
    },
    location: "both",
    asks: [
      { key: "subject", prompt: "Subject and level", required: true },
      {
        key: "who",
        prompt: "Whether they are booking for themselves or for a child",
        required: true,
      },
    ],
    rules: [
      "If the student is a child, take the parent's contact details, not the child's. Never arrange anything directly with a child.",
    ],
    services: {
      "Trial lesson": { price: 20, minutes: 60 },
      "Single lesson": { price: 35, minutes: 60 },
      "Block of five": { price: 160, minutes: 60 },
      "Intensive, two hours": { price: 65, minutes: 120 },
    },
  }),

  trade({
    id: "window_cleaner",
    label: "Window cleaner",
    category: "Everything else",
    blurb: "Regular rounds and one-off cleans.",
    aliases: ["windows", "window cleaning", "gutter", "conservatory", "round"],
    greeting: "Hi — whereabouts are you, and how big is the house?",
    words: {
      practitioner: "cleaner",
      practitioners: "cleaners",
      service: "clean",
      size_unit: "clean",
      business: "business",
    },
    location: "at_customer",
    asks: [JOB_ADDRESS],
    services: {
      "Terraced or flat": { price: 12, minutes: 20 },
      "Semi-detached": { price: 16, minutes: 30 },
      Detached: { price: 22, minutes: 40 },
      "Conservatory roof": { price: 30, minutes: 45 },
      "Gutter clearing": { price: [50, 90], minutes: 60, consult: true },
    },
  }),

  GENERAL,
];

// ═══════════════════════════════════════════════════════════════════ exports

export const VERTICAL_LIST: VerticalPack[] = [
  ...HOME,
  ...BEAUTY,
  ...HEALTH,
  ...PETS,
  ...MOTORING,
  ...OTHER,
];

export const VERTICALS: Record<string, VerticalPack> = Object.fromEntries(
  VERTICAL_LIST.map((pack) => [pack.id, pack]),
);

export const DEFAULT_VERTICAL = "general";

/** Trades grouped for the picker, in the order the categories are declared. */
export const VERTICALS_BY_CATEGORY: { category: TradeCategory; trades: VerticalPack[] }[] =
  TRADE_CATEGORIES.map((category) => ({
    category,
    trades: VERTICAL_LIST.filter((pack) => pack.category === category),
  })).filter((group) => group.trades.length > 0);

/**
 * Anything unrecognised falls back to the general pack rather than throwing.
 * A business whose trade was renamed should still be able to log in.
 */
export function verticalPack(id: string | null | undefined): VerticalPack {
  return VERTICALS[id ?? ""] ?? VERTICALS[DEFAULT_VERTICAL];
}

/** Free-text search over label, blurb and aliases, for the signup picker. */
export function searchTrades(query: string): VerticalPack[] {
  const q = query.trim().toLowerCase();
  if (!q) return VERTICAL_LIST;
  return VERTICAL_LIST.filter((pack) =>
    [pack.label, pack.blurb, ...pack.aliases].some((text) => text.toLowerCase().includes(q)),
  );
}
