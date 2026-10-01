/**
 * The fields a message may use, per kind of message.
 *
 * Giles, 28 Sep, setting up Amber's Paws & Pastures: "there also needs to be a
 * way of adding fields when creating them and reminders and other marketing —
 * currently there is no way of adding customer name and other required fields."
 *
 * He is right twice over, and the second fault is worse than the one he was
 * looking at.
 *
 * ── One ─────────────────────────────────────────────────────────────────────
 *
 * There was no way to *insert* a field. The names existed, and the only places
 * they were written down were a tooltip and the grey example text inside an
 * empty box — which disappears the moment anybody types. So the wording had to
 * be typed by hand, spelled exactly, from memory. A near miss does not fail
 * loudly: {{firstname}} for {{name}} is silently stripped and the customer gets
 * a sentence with a hole in it.
 *
 * ── Two, and this is the one that was actually costing customers ────────────
 *
 * Three screens each advertised a different list, and two of them were wrong:
 *
 *   • Reminders offered five and the warning underneath said "the four above
 *     are the whole list". Off by one, harmless, but it is the kind of thing
 *     that teaches somebody the screen is not to be trusted.
 *
 *   • Campaigns told the owner to use {{what}} — "{{what}} is the job" — and
 *     its own example was "it has been a while since your {{what}}". Nothing
 *     ever filled it. It is not in the renderer's list, so it was stripped on
 *     the way out, and the validator on that very page flagged it as unknown
 *     in the same breath as the label recommending it. Anybody following the
 *     instruction sent "it has been a while since your  — fancy booking
 *     another?" to a real customer. Now filled, from the booking's own title.
 *
 *   • Quick messages offered the reminder list, which includes {{when}} and
 *     {{link}}. An ad-hoc message is not attached to an appointment, so
 *     neither has an honest value and both are stripped — a fact that was
 *     written down in a comment in quickMessages.ts and contradicted by the
 *     screen above it.
 *
 * So the list lives here, once, per kind, and every screen and every validator
 * reads it. A field offered on a screen is a field something fills.
 */

/** The kinds of message a business writes a wording for. */
export type MessageKind = "reminder" | "campaign" | "quick";

export type MessageField = {
  /** The name as it is typed, without the braces. */
  name: string;
  /** What it becomes, in the owner's terms. Shown beside the button. */
  means: string;
  /** What it looks like filled in, for the preview and the examples. */
  example: string;
};

const NAME: MessageField = {
  name: "name",
  means: "their first name",
  example: "Marie",
};
const BUSINESS: MessageField = {
  name: "business",
  means: "your name",
  example: "Amber's Paws & Pastures",
};
const PRACTITIONER: MessageField = {
  name: "practitioner",
  means: "who it is with",
  example: "Amber",
};
const WHEN: MessageField = {
  name: "when",
  means: "the day and time",
  example: "tomorrow at 2pm",
};
/*
 * The link is optional in a text and automatic in an email.
 *
 * An email gets a button whether or not this is used, because a button is
 * chrome rather than part of the sentence. A text only gets it if the business
 * asks, because every character past a hundred and sixty costs them money and
 * appending a URL nobody wrote changes what they chose to say.
 */
const LINK: MessageField = {
  name: "link",
  means: "their own page for this appointment. An email always has a button",
  example: "second-pair.com/b/example",
};
/*
 * What they had, for a message that follows a job.
 *
 * Filled from the booking's title, which is copied from the service when it is
 * booked — see campaigns.ts, where the same field is what decides whether a
 * campaign follows this booking at all. So a campaign set up to follow a colour
 * is only ever sent to somebody whose booking said colour, which is exactly
 * what makes this safe to put in a sentence.
 */
const WHAT: MessageField = {
  name: "what",
  means: "what they had",
  example: "colour",
};

/**
 * What each kind may use.
 *
 * Reminders and confirmations are attached to an appointment, so they know
 * everything. A campaign follows one, so it knows who and what but not when —
 * "it has been a while since your colour" is about the past, and putting a date
 * in it would read as an appointment somebody has not got. A message typed by
 * hand is attached to nothing but a person.
 */
export const MESSAGE_FIELDS: Record<MessageKind, MessageField[]> = {
  reminder: [NAME, WHEN, PRACTITIONER, BUSINESS, LINK],
  campaign: [NAME, WHAT, BUSINESS],
  quick: [NAME, BUSINESS, PRACTITIONER],
};

/** The bare names, for the renderer and the validator. */
export function fieldNames(kind: MessageKind): string[] {
  return MESSAGE_FIELDS[kind].map((f) => f.name);
}

/**
 * Fields used in a template that this kind of message cannot fill.
 *
 * The whole reason this is worth checking: a wrong name does not break
 * anything loudly. It is quietly removed and the customer gets the gap. This is
 * how it is caught on the screen where it was typed, rather than by somebody
 * who received it.
 */
export function unknownIn(template: string, kind: MessageKind): string[] {
  const used = [...template.matchAll(/\{\{\s*([^}\s]+)\s*\}\}/g)].map((m) => m[1].toLowerCase());
  const known = new Set(fieldNames(kind));
  return [...new Set(used.filter((name) => !known.has(name)))];
}

/**
 * How to say the list in a sentence: "{{name}}, {{when}} and {{business}}".
 *
 * Written out rather than counted, because the sentence that was there before
 * counted wrongly — "the four above" under a list of five.
 */
export function sayTheFields(kind: MessageKind): string {
  const names = fieldNames(kind).map((n) => `{{${n}}}`);
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
