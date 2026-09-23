/**
 * Finding a setting by what it is called in somebody's head.
 *
 * Giles: "can we have a search function in the settings area to find things."
 *
 * There are thirteen settings pages and well over a hundred fields on them,
 * and the rail can only say which page a thing is on if you already know which
 * group it belongs to. "Where do I change the deposit" is answered in one
 * second by a box and in four guesses by a rail.
 *
 * Every entry names something that is genuinely on the page it points at.
 * Nothing here is aspirational: a search that offers a setting the product
 * does not have is worse than no search, because it sends somebody looking for
 * a screen that will never appear.
 *
 * The keywords are the other half of the job and the half worth the effort.
 * Nobody types "reminder templates" — they type "text before appointment", or
 * "chase", or "no show". A search that only matches the words we chose is a
 * search that only works for whoever named things.
 */

export type Setting = {
  /** What it is called on the page, exactly. */
  label: string;
  /** Where it lives. */
  href: string;
  /** The page's own name in the rail, for saying where somebody is going. */
  page: string;
  /** What somebody might type instead. Lower case, no punctuation. */
  keywords: string;
  /** Owner-only, which is most of them. */
  ownerOnly?: boolean;
};

export const SETTINGS: Setting[] = [
  /* ---------------------------------------------------- your business */
  { label: "Business name and address", href: "/settings", page: "Business", keywords: "name address where we are located company trading", ownerOnly: true },
  { label: "A picture of your business", href: "/settings", page: "Business", keywords: "photo logo picture image brand shopfront trust", ownerOnly: true },
  { label: "Booking rules", href: "/settings", page: "Business", keywords: "notice how far ahead lead time booking rules limits", ownerOnly: true },
  { label: "Cancellation policy", href: "/settings", page: "Business", keywords: "cancel cancellation refund notice policy", ownerOnly: true },
  { label: "Deposits", href: "/settings", page: "Business", keywords: "deposit upfront pay first hold booking fee", ownerOnly: true },
  { label: "Do you travel to customers?", href: "/settings", page: "Business", keywords: "travel mobile call out area radius visit", ownerOnly: true },
  { label: "Areas you cover", href: "/settings", page: "Business", keywords: "area postcode radius travel coverage where", ownerOnly: true },
  { label: "Consultation", href: "/settings", page: "Business", keywords: "consultation consult chat first appointment", ownerOnly: true },
  { label: "Compliance", href: "/settings", page: "Business", keywords: "compliance insurance certificate licence legal gas electrical", ownerOnly: true },
  { label: "Diary", href: "/settings", page: "Business", keywords: "diary opening hours calendar days closed", ownerOnly: true },

  /* ------------------------------------------------------------ prices */
  { label: "What the assistant will quote", href: "/settings/pricing", page: "Prices", keywords: "price prices cost quote how much rates list menu services", ownerOnly: true },
  { label: "How you price", href: "/settings/pricing", page: "Prices", keywords: "price model hourly fixed day rate from", ownerOnly: true },
  { label: "Needs a form signed first", href: "/settings/pricing", page: "Prices", keywords: "form consent waiver signed before booking", ownerOnly: true },

  /* -------------------------------------------------------------- team */
  { label: "Who is who", href: "/settings/artists", page: "Team", keywords: "staff team people stylist add somebody new starter leaver", ownerOnly: true },
  { label: "Hourly rate, day rate, minimum charge", href: "/settings/artists", page: "Team", keywords: "rate pay charge hourly day minimum per person", ownerOnly: true },
  { label: "Channels of their own", href: "/settings/artists", page: "Team", keywords: "their own number instagram whatsapp per person channel", ownerOnly: true },
  { label: "How they write", href: "/settings/artists", page: "Team", keywords: "tone voice wording how they sound own words", ownerOnly: true },
  { label: "Booking page link", href: "/settings/artists", page: "Team", keywords: "booking link share url page book online", ownerOnly: true },

  /* --------------------------------------------------------- getting paid */
  { label: "Getting paid", href: "/settings/money", page: "Getting paid", keywords: "stripe card payment bank payout money take payment", ownerOnly: true },

  /* ------------------------------------------------------------ channels */
  { label: "Your number", href: "/settings/install", page: "Channels", keywords: "number phone sms text mobile line twilio", ownerOnly: true },
  { label: "When somebody rings it, ring me on", href: "/settings/install", page: "Channels", keywords: "forward ring my mobile divert call forwarding", ownerOnly: true },
  { label: "Voicemail response", href: "/settings/install", page: "Channels", keywords: "voicemail answerphone message missed call text back answering", ownerOnly: true },
  { label: "Receptionist", href: "/settings/install", page: "Channels", keywords: "receptionist answers talks speaks picks up voice agent", ownerOnly: true },
  { label: "For your website", href: "/settings/install", page: "Channels", keywords: "widget website embed code snippet install script chat bubble", ownerOnly: true },
  { label: "How it looks", href: "/settings/install", page: "Channels", keywords: "colour color widget appearance shape size lettering nudge", ownerOnly: true },
  { label: "Email you forward here", href: "/settings/install", page: "Channels", keywords: "email forwarding inbox address enquiries", ownerOnly: true },

  /* ----------------------------------------------------------- assistant */
  { label: "Tone of voice", href: "/settings/assistant", page: "Assistant", keywords: "tone voice sound friendly formal personality how it writes", ownerOnly: true },
  { label: "House rules", href: "/settings/assistant", page: "Assistant", keywords: "rules instructions always never tell it what to do", ownerOnly: true },
  { label: "Never say", href: "/settings/assistant", page: "Assistant", keywords: "never say banned words avoid do not mention", ownerOnly: true },
  { label: "Always come and get me for", href: "/settings/assistant", page: "Assistant", keywords: "hand over escalate get me human refuse complicated", ownerOnly: true },
  { label: "Who answers first", href: "/settings/assistant", page: "Assistant", keywords: "first refusal head start answer first me or it", ownerOnly: true },
  { label: "Try it yourself", href: "/settings/assistant", page: "Assistant", keywords: "test try preview demo play", ownerOnly: true },

  /* ----------------------------------------------------------- questions */
  { label: "Questions people ask", href: "/settings/faqs", page: "Questions", keywords: "faq questions answers parking allergies common asked", ownerOnly: true },

  /* ------------------------------------------------ messages you send */
  { label: "Booking confirmations", href: "/settings/reminders", page: "Confirmations and reminders", keywords: "confirmation confirm booked straight away receipt when they book", ownerOnly: true },
  { label: "Reminders before an appointment", href: "/settings/reminders", page: "Confirmations and reminders", keywords: "reminder remind day before text no show chase nudge", ownerOnly: true },
  { label: "How this one goes", href: "/settings/reminders", page: "Confirmations and reminders", keywords: "email or text channel how it is sent both", ownerOnly: true },
  { label: "Review requests", href: "/settings/reviews", page: "Review requests", keywords: "review google stars feedback ask afterwards rating", ownerOnly: true },
  { label: "Your review link", href: "/settings/reviews", page: "Review requests", keywords: "review link google url where they leave it", ownerOnly: true },
  { label: "Campaigns", href: "/settings/marketing", page: "Marketing", keywords: "marketing campaign offer promotion win back come back again", ownerOnly: true },

  /* ------------------------------------------------------ around a booking */
  { label: "Forms", href: "/settings/forms", page: "Forms", keywords: "form consent waiver questionnaire sign paperwork before", ownerOnly: true },

  /* ------------------------------------------------------------- yours */
  { label: "Your hours and rates", href: "/settings/you", page: "Yours", keywords: "my hours my rate working days off holiday shifts" },
  { label: "Your own calendar", href: "/settings/you", page: "Yours", keywords: "calendar google outlook sync feed ical my diary" },
  { label: "How long enquiries are kept", href: "/settings/data", page: "Your data", keywords: "delete data retention keep how long privacy gdpr erase" },
];

/**
 * What matches, best first.
 *
 * Scored rather than filtered, because "email" should put the forwarding
 * address above the review link that happens to mention email in its keywords.
 * A label that starts with what was typed beats one that merely contains it,
 * and both beat a keyword match — somebody typing "rev" is looking for the
 * thing called Review, not for whatever mentions reviews.
 *
 * An empty query returns nothing rather than everything: the rail is already
 * the list of everything, and repeating it under the box would be noise.
 */
export function findSettings(query: string, options: { owner?: boolean } = {}): Setting[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];

  const allowed = options.owner === false ? SETTINGS.filter((s) => !s.ownerOnly) : SETTINGS;

  return allowed
    .map((s) => {
      const label = s.label.toLowerCase();
      if (label.startsWith(q)) return { s, score: 0 };
      if (label.includes(q)) return { s, score: 1 };
      if (s.page.toLowerCase().includes(q)) return { s, score: 2 };
      if (s.keywords.includes(q)) return { s, score: 3 };
      return null;
    })
    .filter((m): m is { s: Setting; score: number } => m !== null)
    .sort((a, b) => a.score - b.score || a.s.label.localeCompare(b.s.label))
    .map((m) => m.s)
    .slice(0, 8);
}
