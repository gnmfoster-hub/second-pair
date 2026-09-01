/**
 * Filling a reminder template.
 *
 * Kept apart from the sending so it can be tested on its own: this is the text
 * that actually reaches a customer's phone, and it is the last thing anybody
 * looks at before it goes.
 *
 * Nothing here touches the database or the network, deliberately.
 */

/** The only names a template may use. Anything else is stripped. */
export const REMINDER_PLACEHOLDERS = ["name", "practitioner", "business", "when"] as const;

export type ReminderValues = {
  name?: string | null;
  practitioner?: string | null;
  business?: string | null;
  when?: string | null;
};

/**
 * Fills a template. Anything unrecognised is stripped rather than shown — a
 * client seeing "{{name}}" is worse than a slightly plainer sentence.
 */
export function renderReminder(template: string, values: ReminderValues): string {
  return template
    .replace(/\{\{\s*name\s*\}\}/gi, values.name?.trim() || "there")
    .replace(/\{\{\s*practitioner\s*\}\}/gi, values.practitioner?.trim() || "us")
    .replace(/\{\{\s*business\s*\}\}/gi, values.business?.trim() || "us")
    .replace(/\{\{\s*when\s*\}\}/gi, values.when?.trim() || "your appointment")
    .replace(/\{\{[^}]*\}\}/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/**
 * Placeholders a template uses that will never be filled.
 *
 * A typo — {{firstname}} for {{name}} — does not break anything loudly. It is
 * quietly removed, and the customer gets a sentence with a hole in it. This is
 * how that gets caught before it is written into a trade pack.
 */
export function unknownPlaceholders(template: string): string[] {
  const used = [...template.matchAll(/\{\{\s*([^}\s]+)\s*\}\}/g)].map((m) => m[1].toLowerCase());
  const known = new Set<string>(REMINDER_PLACEHOLDERS);
  return [...new Set(used.filter((name) => !known.has(name)))];
}
