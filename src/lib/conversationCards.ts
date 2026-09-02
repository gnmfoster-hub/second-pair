/**
 * The two rules that decide what a booking card shows.
 *
 * Both were written inline in the widget, and one of them was then copied into
 * the home page demo so the two would agree. Copied rules stop agreeing — and
 * these are the rules that decide whether somebody can tap a time that has
 * already gone, which is not a thing to keep two versions of.
 *
 * Pure string and value logic, so they are tested directly rather than through
 * a browser.
 */

/** The kinds of card a reply can carry. Mirrors Moment["kind"]. */
export type CardKind = "slots" | "quote" | "booked" | "deposit" | "handover";

/**
 * Whether a newer card puts an older one out of date.
 *
 * A card is a control, not a record. The assistant will happily look at the
 * diary twice in one conversation, and each turn brought its own card — so the
 * same times sat in the transcript twice, the earlier set dead. Worse than
 * untidy: somebody scrolling back and tapping one would be asking for a slot
 * that had been withdrawn.
 *
 * Booking retires the times as well, and that one matters most. Without it four
 * tappable slots sat underneath a confirmed appointment, inviting somebody who
 * had just booked to book again.
 *
 * Nothing retires a quote: the price stays true after the booking is made, and
 * it is the thing people scroll back to check.
 */
export function retires(newer: CardKind, older: CardKind): boolean {
  if (newer === older) return true;
  return newer === "booked" && older === "slots";
}

/**
 * The reply text, minus a link the card underneath already carries.
 *
 * The assistant is told to put the payment link on its own line and must keep
 * doing that: a text message has no buttons, and that sentence is what gets
 * stored and sent. But in the widget it lands directly above a card with the
 * same link on a button, so the customer is shown one URL twice — once as raw
 * text they are being asked to trust with their card details.
 *
 * Only the rendering changes. The stored reply is untouched, and if the card is
 * not drawn the link stays exactly where it was.
 *
 * Removes whole lines only. A link mentioned mid-sentence is part of what the
 * assistant said and cutting it would leave a hole in the sentence.
 */
export function withoutLink(text: string, url: string): string {
  const bare = url.replace(/^https?:\/\//, "");

  return text
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return trimmed !== url && trimmed !== bare;
    })
    .join("\n")
    .replace(/(\n\s*){3,}/g, "\n\n")
    .trim();
}
