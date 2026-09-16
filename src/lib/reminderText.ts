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

/**
 * How many texts a message is actually sent as.
 *
 * A text is 160 characters; past that it is split and every piece is charged
 * for. Anything outside the GSM alphabet — a curly quote, an em dash, an
 * emoji — drops the whole message to 70 characters a piece, which is how a
 * perfectly ordinary two-line reminder quietly costs four texts.
 */
export function segments(text: string): number {
  const body = text ?? "";
  if (!body) return 0;
  const GSM = /^[@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&'()*+,\-./0-9:;<=>?¡A-ZÄÖÑÜ§¿a-zäöñüà\n\r\u000c\u001b^{}\[~\]|€]*$/;
  const plain = GSM.test(body);
  const one = plain ? 160 : 70;
  const many = plain ? 153 : 67;
  return body.length <= one ? 1 : Math.ceil(body.length / many);
}

/**
 * The same reminder, cut to one text.
 *
 * Measured on the live database: the earlier reminder runs to about 210
 * characters because it carries the trade's own preparation advice — park
 * somewhere, have the vaccination card ready, bring your licence — and every
 * one of them is charged as two texts. At two hundred appointments a month
 * that is real money for advice that the email version can carry in full and
 * for free.
 *
 * So the text keeps the sentence that matters — who is coming and when — and
 * the rest goes. Never mid-word, never mid-sentence: it keeps whole sentences
 * until the next one would not fit. If even the first sentence is too long it
 * is sent as it is, because a cut-off reminder is worse than a dear one.
 */
export function forOneText(body: string): string {
  const text = (body ?? "").trim();
  if (!text || segments(text) <= 1) return text;

  const sentences = text.match(/[^.!?]+[.!?]*\s*/g) ?? [text];
  let kept = "";

  for (const sentence of sentences) {
    const next = (kept + sentence).trimEnd();
    if (segments(next) > 1) break;
    kept = next;
  }

  return kept || text;
}
