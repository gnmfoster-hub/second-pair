/**
 * The four trade scenarios, copied verbatim from the design pack's
 * reference/hero-reference.html.
 *
 * DESIGN.md §7: each scenario is one object — the business, who is busy, the
 * channel, the ten messages, the two booking cards, which diary rows they land
 * on, the rows already filled and the closing line. Adding a trade is adding
 * one object, and /for/[trade] reuses the same one.
 *
 * Not rewritten, not tidied, not "improved". The wording is the brief's and
 * the placeholders are deliberate: [YOUR PRICE] and [DEPOSIT] stay until real
 * numbers are supplied.
 */
export type Scenario = {
  /** The demo business. */
  name: string;
  /** Its initials, for the avatar. */
  ini: string;
  /** Who is too busy to answer. */
  who: string;
  /** What they are doing while the assistant works. */
  doing: string;
  /** Which channel the enquiry arrived on. */
  ch: string;
  /** The conversation: c = customer, a = assistant. */
  c1: string; a1: string; c2: string; a2: string; c3: string; a3: string;
  /** The first booking card, and the diary row it lands in. */
  k1d: string; k1t: string; k1: string; k1s: string; d1: number; r1: string; r1s: string;
  /** The second enquiry, arriving on another channel mid-conversation. */
  ban: string; banq: string; a4: string; c5: string;
  /** The second booking card, and its row. */
  k2d: string; k2t: string; k2: string; k2s: string; d2: number; r2: string; r2s: string;
  /** What is already in the diary. Empty strings are free slots. */
  rows: string[];
  /** The line under the diary once both are in. */
  done: string;
};

export type TradeKey = "tattoo" | "plumber" | "hair" | "groomer";

/** The order they appear in the "Show me a" row. */
export const TRADES: { key: TradeKey; label: string }[] = [
  { key: "tattoo", label: "Tattoo studio" },
  { key: "plumber", label: "Plumber" },
  { key: "hair", label: "Hair salon" },
  { key: "groomer", label: "Dog groomer" },
];

export const SCEN: Record<TradeKey, Scenario> = {
  "tattoo": {
    "name": "Living Canvas Tattoo",
    "ini": "LC",
    "who": "Kiera",
    "doing": "Kiera is tattooing",
    "ch": "WhatsApp",
    "c1": "Hi, do you do fine line? Small piece on my forearm, about 8cm",
    "a1": "We do. Got a picture of the kind of thing you’re after?",
    "c2": "this sort of thing, how much?",
    "a2": "Lovely. About an hour, [YOUR PRICE]. Thursday 2pm or Saturday 11am are free.",
    "c3": "saturday please, can i pay a deposit",
    "a3": "Saturday 11 it is. Here’s the deposit link, [DEPOSIT] holds the slot.",
    "k1d": "SAT",
    "k1t": "11AM",
    "k1": "Fine line, forearm",
    "k1s": "Deposit paid",
    "d1": 5,
    "r1": "11am Fine line",
    "r1s": "DEPOSIT PAID",
    "ban": "Dan on Instagram",
    "banq": "any chance of a touch up this week?",
    "a4": "Dan, Thursday 2pm’s free for a touch up. Want it?",
    "c5": "yes mate cheers",
    "k2d": "THU",
    "k2t": "2PM",
    "k2": "Touch up · Dan",
    "k2s": "Booked",
    "d2": 3,
    "r2": "2pm Touch up · Dan",
    "r2s": "BOOKED",
    "rows": [
      "Colour · Mrs Patel",
      "Sleeve s3 · Sam",
      "",
      "",
      "Consult · J. Ward",
      ""
    ],
    "done": "Two bookings, one deposit. Reminders set. Kiera was tattooing the whole time."
  },
  "plumber": {
    "name": "Dave’s Plumbing",
    "ini": "DP",
    "who": "Dave",
    "doing": "Dave is under a sink",
    "ch": "WhatsApp",
    "c1": "Morning, my boiler’s banging and there’s no hot water. Can anyone come today?",
    "a1": "Morning. Can you send a photo of the front panel and any error code on it?",
    "c2": "it says F22",
    "a2": "F22 is low pressure, usually a quick fix. Dave can be with you Wednesday 1 to 3. Call-out [YOUR PRICE], parts on top.",
    "c3": "yes please, can i pay on the day",
    "a3": "Course. Booked Wednesday 1 to 3, 14 Elm Road. Dave will text when he’s 20 minutes away.",
    "k1d": "WED",
    "k1t": "1PM",
    "k1": "Boiler F22 · 14 Elm Rd",
    "k1s": "Booked",
    "d1": 2,
    "r1": "1pm Boiler · Elm Rd",
    "r1s": "BOOKED",
    "ban": "Karen on Facebook",
    "banq": "can you quote for a new bathroom?",
    "a4": "Karen, Dave can pop round to quote Thursday 5pm. Suit you?",
    "c5": "perfect thanks",
    "k2d": "THU",
    "k2t": "5PM",
    "k2": "Bathroom quote · Karen",
    "k2s": "Booked",
    "d2": 3,
    "r2": "5pm Bathroom quote",
    "r2s": "BOOKED",
    "rows": [
      "Rad swap · Hele Park",
      "Tap · Mrs Cole",
      "",
      "",
      "Service · The Vine",
      ""
    ],
    "done": "One repair, one quote. Both texted the day before. Dave never picked up the phone."
  },
  "hair": {
    "name": "Rachel’s Hair",
    "ini": "RH",
    "who": "Rachel",
    "doing": "Rachel has a client in",
    "ch": "Instagram",
    "c1": "hi, anything for a cut and colour this week?",
    "a1": "Hi! Full head or roots? And roughly how long is your hair?",
    "c2": "roots, about this length",
    "a2": "Roots and a cut is about 2 hours, [YOUR PRICE]. Thursday 10am or Saturday 9am are free.",
    "c3": "saturday 9 please",
    "a3": "Saturday 9am with Rachel. Deposit link below, [DEPOSIT] holds it.",
    "k1d": "SAT",
    "k1t": "9AM",
    "k1": "Roots & cut",
    "k1s": "Deposit paid",
    "d1": 5,
    "r1": "9am Roots & cut",
    "r1s": "DEPOSIT PAID",
    "ban": "Jess on Instagram",
    "banq": "do you do bridal trials?",
    "a4": "We do, Jess. Trials are Thursdays, 2pm’s free this week.",
    "c5": "book me in!",
    "k2d": "THU",
    "k2t": "2PM",
    "k2": "Bridal trial · Jess",
    "k2s": "Booked",
    "d2": 3,
    "r2": "2pm Bridal trial",
    "r2s": "BOOKED",
    "rows": [
      "Balayage · Amy",
      "Cut · Mr Hurst",
      "",
      "",
      "Colour · Nina",
      ""
    ],
    "done": "Two bookings, one deposit. Reminders set. Rachel was mid-foil the whole time."
  },
  "groomer": {
    "name": "Muddy Paws",
    "ini": "MP",
    "who": "Jo",
    "doing": "Jo is grooming",
    "ch": "WhatsApp",
    "c1": "Can you fit my cockapoo in this week? He’s a bit matted",
    "a1": "Poor lad. Send me a photo so I can see how bad it is?",
    "c2": "here he is",
    "a2": "That’s a full groom, about 2 hours, [YOUR PRICE]. Wednesday 11 or Friday 9 are free.",
    "c3": "friday 9 please",
    "a3": "Friday 9am for Alfie. Reminder the night before, and bring his favourite treat.",
    "k1d": "FRI",
    "k1t": "9AM",
    "k1": "Full groom · Alfie",
    "k1s": "Booked",
    "d1": 4,
    "r1": "9am Full groom · Alfie",
    "r1s": "BOOKED",
    "ban": "Tom on WhatsApp",
    "banq": "nail trim for a lab, any drop-ins?",
    "a4": "Tom, Thursday 4pm for a nail trim, 15 minutes. Want it?",
    "c5": "yes cheers",
    "k2d": "THU",
    "k2t": "4PM",
    "k2": "Nail trim · Tom",
    "k2s": "Booked",
    "d2": 3,
    "r2": "4pm Nail trim · Tom",
    "r2s": "BOOKED",
    "rows": [
      "Groom · Bella",
      "Puppy intro · Max",
      "",
      "",
      "",
      "Groom · Rufus"
    ],
    "done": "Two bookings. Reminders set. Jo had a wet spaniel in the tub the whole time."
  }
};
