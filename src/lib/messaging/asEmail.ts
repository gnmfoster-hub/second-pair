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

import { buildEmail } from "./emailTemplate.ts";

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
  /*
   * A comma, not a long dash.
   *
   * This is the subject on every email the assistant sends, so it was the
   * most-read long dash in the product and the database sweep could never
   * have found it: it is built here, in code, not stored anywhere. The rule
   * is the rule wherever the string is written.
   */
  if (!topic) return `Your enquiry, ${businessName}`;

  // Trimmed to something that survives a phone's preview line.
  const short = topic.length > 48 ? `${topic.slice(0, 45).trimEnd()}…` : topic;
  return `${short}, ${businessName}`;
}

export function asEmail({
  body,
  businessName,
  firstName,
  canReply,
  about,
  photoUrl,
  contactEmail,
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
  /** The business's own photograph, where it has one. */
  photoUrl?: string | null;
  /**
   * The business's own public address, for the foot of the letter.
   *
   * Deliberately not the reply-to. A reply is addressed to
   * slug@in.second-pair.com so the assistant can carry the conversation on,
   * which is right and is the last thing to print at somebody: it is our
   * plumbing, and an address with our domain in it at the foot of a salon's
   * email is exactly the fault Giles reported on 21 October.
   */
  contactEmail?: string | null;
}): { subject: string; text: string; html: string } {
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

  /*
   * The same words, laid out.
   *
   * This is the email the product sends most of: every reply to somebody who
   * wrote in by email, and every answer the widget offers to send on. It went
   * out as text alone, which a mail client sets in its own default — Times
   * New Roman, in Outlook on Windows — with the business's name as the last
   * line and nothing else to say who it was from. Giles: "they are all just
   * boring text."
   *
   * No details table and no button, because a reply is prose. The assistant
   * has written something; inventing rows to sit under it would be decorating
   * a sentence. What it gets is the business at the top, its photograph where
   * it has one, the paper, the ink and a typeface.
   *
   * The sign-off comes off the body in the html, because the template already
   * puts the business's name where a letterhead goes. The text keeps it:
   * there is no letterhead in a plain-text email.
   */
  const html = buildEmail({
    business: businessName,
    body: `${greeting}${spaced}${reply}`,
    photoUrl: photoUrl ?? null,
    contactEmail: contactEmail ?? null,
    /*
     * Not in the foot as well.
     *
     * The words above already say it, in the business's own voice, which is
     * the better place for it. The foot says it on the emails that have no
     * room for it in the prose: a reminder, a receipt, a confirmation.
     */
    replies: false,
  });

  return {
    subject: subjectFor(businessName, about),
    text: `${greeting}${spaced}${reply}\n\n${businessName}`,
    html,
  };
}
