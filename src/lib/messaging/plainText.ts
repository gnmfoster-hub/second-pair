/**
 * Making a message cheap to text without changing what it says.
 *
 * A text message is billed by the segment, and which alphabet it needs decides
 * how big a segment is. Plain GSM-7 gives 153 characters per segment in a
 * concatenated message; one character outside that alphabet drops the whole
 * message — not just that character — to UCS-2 and 67.
 *
 * The assistant writes properly: curly apostrophes, em dashes, ellipses. Every
 * one of those is outside GSM-7, so a perfectly ordinary two-sentence reply
 * was being sent as four segments instead of two, on every text, for the life
 * of the business. The words are identical either way. Nobody has ever read a
 * text message and thought less of a salon for using a straight apostrophe.
 *
 * This is only applied on the way to a phone. What is written in the inbox,
 * the widget and the email keeps its proper typography.
 */

/** Characters that survive GSM-7 on their own. */
const GSM = new Set(
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
    "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà",
);

/** Characters that cost two GSM-7 slots because they sit in the extension table. */
const GSM_EXTENDED = new Set("^{}\[~]|€");

const SUBSTITUTIONS: [RegExp, string][] = [
  [/[‘’‚‛]/g, "'"],
  [/[“”„‟]/g, '"'],
  [/[–—―]/g, "-"],
  [/…/g, "..."],
  [/[   ]/g, " "],
  [/•/g, "*"],
  [/­/g, ""],
  // Written by the assistant when it lays a reply out in parts. A text message
  // has no paragraphs worth the two characters they cost.
  [/\n{2,}/g, "\n"],
];

/** The same message, spelled so a phone can carry it in the cheap alphabet. */
export function forSms(text: string): string {
  let out = text;
  for (const [pattern, replacement] of SUBSTITUTIONS) out = out.replace(pattern, replacement);
  return out.trim();
}

/** Whether every character survives the cheap alphabet. */
export function fitsGsm7(text: string): boolean {
  return [...text].every((c) => GSM.has(c) || GSM_EXTENDED.has(c));
}

/**
 * How many segments this would be billed as.
 *
 * Single-segment messages get the full 160 (or 70); anything longer loses
 * space in every segment to the header that joins them up.
 */
export function smsSegments(text: string): number {
  if (!text) return 0;

  if (fitsGsm7(text)) {
    const units = [...text].reduce((n, c) => n + (GSM_EXTENDED.has(c) ? 2 : 1), 0);
    return units <= 160 ? 1 : Math.ceil(units / 153);
  }

  // UCS-2 counts code units, so anything outside the basic plane costs two.
  const units = text.length;
  return units <= 70 ? 1 : Math.ceil(units / 67);
}
