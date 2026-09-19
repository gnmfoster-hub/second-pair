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
