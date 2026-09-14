/**
 * Turning a message into an email.
 *
 * Everything this product sends is written once and delivered on whatever
 * channel reaches somebody — which is right, because writing four versions of
 * "we can do Thursday at two" is how three of them go stale. But a message
 * written for a chat window and posted into an inbox arrives looking like a
 * text message that has wandered in: no greeting, no sign-off, no idea who it
 * is from until you look at the sender, and a subject line reading "Message
 * from Willow & Co", which is what a mail filter files under junk.
 *
 * So the words stay exactly as they were written and the envelope is built
 * around them. Nothing here changes what was said.
 *
 * Alias-free, so the composing can be tested without sending anything.
 */

/** Openings that mean somebody has already been greeted. */
const GREETED = /^\s*(hi|hello|hey|dear|good\s+(morning|afternoon|evening))\b/i;

/**
 * Whether the message already opens with a greeting.
 *
 * The assistant usually writes "Hi Jane," itself, and a second greeting bolted
 * on top reads as a machine that is not listening to itself — which is exactly
 * the impression this is trying to avoid.
 */
export function alreadyGreets(body: string): boolean {
  return GREETED.test(body);
}

/**
 * A subject somebody will recognise in a list of forty.
 *
 * The same one every time for a given business, on purpose: mail clients
 * thread on subject, so a stable line keeps a conversation in one place
 * instead of spraying six separate messages down somebody's inbox.
 */
export function subjectFor(businessName: string, about?: string | null): string {
  const topic = (about ?? "").trim();
  if (!topic) return `Your enquiry — ${businessName}`;

  // Trimmed to something that survives a phone's preview line.
  const short = topic.length > 48 ? `${topic.slice(0, 45).trimEnd()}…` : topic;
  return `${short} — ${businessName}`;
}

export function asEmail({
  body,
  businessName,
  firstName,
  canReply,
  about,
}: {
  body: string;
  businessName: string;
  /** Who it is going to, where that is known. */
  firstName?: string | null;
  /**
   * Whether replying to it reaches the business.
   *
   * Said out loud when true, because an email from an address somebody does
   * not recognise is one they answer by ringing up, or not at all.
   */
  canReply: boolean;
  /** What the enquiry was about, for the subject line. */
  about?: string | null;
}): { subject: string; text: string } {
  const name = (firstName ?? "").trim().split(" ")[0];

  const greeting = alreadyGreets(body) ? "" : `Hello${name ? ` ${name}` : ""},\n\n`;

  /*
   * Paragraphs, from a message written as one block.
   *
   * A chat message is often three sentences with no blank lines in it, which
   * in an email is a wall. Anything the writer already separated is left
   * alone; this only rescues the ones that were not.
   */
  const spaced = body.includes("\n\n")
    ? body.trim()
    : body
        .trim()
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean)
        .join("\n\n");

  const reply = canReply
    ? "\n\nJust reply to this email and it comes straight back to us."
    : "";

  return {
    subject: subjectFor(businessName, about),
    text: `${greeting}${spaced}${reply}\n\n${businessName}`,
  };
}
