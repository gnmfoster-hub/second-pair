/**
 * Things the assistant must never say to somebody's customer.
 *
 * Every one of these has happened, on a real business, and every one was found
 * by a person reading a reply rather than by anything here. That is the whole
 * reason this exists: the faults are not crashes, they are sentences. Nothing
 * throws, nothing is logged, and the only symptom is a customer reading
 * something that makes the business look foolish.
 *
 * Kept as rules rather than as a model judging a model, because a rule can be
 * argued with, costs nothing to run on every reply, and says exactly what it
 * objected to.
 */

export type Slip = {
  /** What is wrong, in the words somebody would use to report it. */
  what: string;
  /** The words that triggered it, so the report is checkable. */
  saying: string;
};

type Rule = { what: string; pattern: RegExp };

const RULES: Rule[] = [
  /*
   * Thinking out loud.
   *
   * Living Canvas answered a Shopify order notification with "This one's an
   * automated Shopify order notification — no need for tools or a name here"
   * in the middle of the reply, between the privacy line and the actual words.
   * That is the model working out what to do, written into the message and
   * sent. It reads like machinery through a wall.
   */
  {
    what: "narrates its own reasoning instead of writing the message",
    pattern:
      /\bno need for (tools|a name|a tool)\b|\bthis (one'?s|is) an? [a-z ]*\b(automated|notification|sales pitch|enquiry)\b[^.?!]*\b(so|—|-)\b|\bnothing to book in from\b|\b(I|we) (should|will|can) (use|call|skip) (the )?[a-z_]+ tool\b|\btool (call|result)s?\b/i,
  },

  /*
   * A price nobody set.
   *
   * A business with no prices yet was quoting "£0 to £0" and being told to say
   * it with confidence. Free is never the answer a business wants given on its
   * behalf, and zero is what an empty price list looks like.
   */
  {
    what: "quotes nothing, or free",
    pattern: /£\s*0(?:\.00)?\s*(?:to|–|-|—)\s*£?\s*0(?:\.00)?|\bit'?s free\b|\bno charge\b|\bfree of charge\b/i,
  },

  /*
   * Certainty it cannot have.
   *
   * A business with no opening hours set was telling customers it was "fully
   * booked for the next three weeks" — turning away its own first enquiries
   * with a claim nobody made.
   */
  {
    what: "claims to be full or closed without knowing",
    pattern: /\bfully booked\b|\bno availability\b|\bwe'?re closed (for|until)\b|\bnothing (available|free) (for|until) (the next|weeks)\b/i,
  },

  /*
   * A channel it cannot use.
   *
   * "I'll text you" on a business with no number, which is most of them.
   */
  {
    what: "promises to text or call when it may not be able to",
    pattern: /\b(I'?ll|I will|we'?ll|we will) (text|call|ring|WhatsApp) you\b/i,
  },

  /* Somebody else's problem, said out loud. */
  {
    what: "blames the system in front of a customer",
    pattern: /\b(database|server|API|webhook|migration|null|undefined|error \d{3})\b|\bsomething went wrong at our end\b/i,
  },

  /* A person, which it is not. */
  {
    what: "claims to be a person",
    pattern: /\bI'?m a (real )?person\b|\bI'?m not a (bot|robot|machine|computer)\b|\byes,? I'?m human\b/i,
  },

  /*
   * The long dash, which is how a machine writes.
   *
   * Giles, looking at a week of real replies: get rid of the unnecessary
   * dashes, it makes it look very AI. He is right, and it is the most
   * frequent tell in everything this thing writes — "Booked, Dawn — Monday
   * at 9am", "We do — balayage is £120", two or three to a message. Almost
   * nobody types one on a phone.
   *
   * Only between words, so a minus sign, a price range and a date range are
   * all untouched: £120-£160 and 9am-5pm are not this.
   */
  {
    what: "joins a sentence with a long dash, which is how a machine writes",
    pattern: /\w\s[—–]\s\w/,
  },

  /*
   * Opening hours that contradict themselves inside one sentence.
   *
   * Dan's Driving School, asked about Sundays, answered: "Dan's out Monday to
   * Friday, and Saturday mornings up to 3pm." Saturday is nine until three, so
   * the hours are right and the word is wrong, and a customer reading it cannot
   * tell which half to believe. They either turn up at one o'clock to a closed
   * door, or do not ring at two because it said mornings.
   *
   * Nothing threw and nothing was logged. It is a sentence, which is where
   * every fault worth finding in this thing lives.
   *
   * Narrow on purpose: only the word attached directly to a closing time in the
   * afternoon. "Mornings only, back at 2pm" and "Saturday mornings 8:30 till
   * 12:30" both say something true and neither matches.
   */
  {
    what: "calls an afternoon a morning",
    pattern:
      /\bmornings?\b[^.!?]{0,25}\b(?:up to|until|till|through to|to)\s*(?:1[3-9]|[1-9])(?::\d{2})?\s*pm\b/i,
  },

  /*
   * A cancellation it cannot make.
   *
   * There is no tool for cancelling anything. The assistant can quote, offer
   * times, book, take a deposit and hand over to a person, and that is all —
   * so every sentence in which it has cancelled something is false by
   * construction, which is what makes this a rule rather than a judgement.
   *
   * Asked to cancel an MOT it escalated correctly and then said: "Done —
   * that's cancelled, Dawn. Monday 8am is off the diary and nobody will be
   * expecting the Golf." The appointment was still there. Somebody who
   * believes that does not turn up, so the bay sits empty on a Monday
   * morning, or the garage rings to ask where the car is.
   *
   * Deliberately narrow: it catches the claim, never the subject. "If you need
   * to cancel, give us a ring", "I've passed it to the garage to take that
   * Monday 8am off the diary" and "it isn't cancelled until you hear back" are
   * all correct things to say, and none of them match.
   */
  {
    what: "says it has cancelled something, which it cannot do",
    pattern:
      /\b(i'?ve|i have|we'?ve|we have) (now )?cancelled\b|\b(that'?s|that is|it'?s|it is|this is) (now )?cancelled\b|\bis off the diary\b|\bhas been (cancelled|taken off)\b/i,
  },
];

/**
 * Everything wrong with one reply.
 *
 * Returns every rule it broke rather than the first, because a reply that
 * narrates its reasoning and quotes zero has two separate faults and fixing
 * one would leave the other.
 */
export function neverSay(reply: string): Slip[] {
  const said = (reply ?? "").replace(/\s+/g, " ");
  const out: Slip[] = [];

  for (const rule of RULES) {
    const hit = said.match(rule.pattern);
    if (hit) out.push({ what: rule.what, saying: hit[0].trim().slice(0, 90) });
  }

  return out;
}
