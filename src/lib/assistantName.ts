/**
 * What the assistant calls itself.
 *
 * It had no name and opened with the business's, which reads as a form rather
 * than a person and leaves a customer with nothing to say back to. "Thanks
 * Robin" is a different conversation from "thanks".
 *
 * A named thing that says plainly it is an assistant is also more honest than
 * an unnamed one somebody quietly assumes is a person — the disclosure does
 * the work either way, and a name makes the thing easier to talk to rather
 * than easier to mistake.
 */

/**
 * The default, when nobody has chosen.
 *
 * Robin because it is short, spelled one way, said the same in every accent,
 * and belongs to no gender — an assistant answering for a barber and for a
 * nail salon should not arrive having picked a side. It is also a name nobody
 * mistakes for a brand, which is the point: it is answering for the business,
 * not for us.
 */
export const DEFAULT_ASSISTANT_NAME = "Robin";

/**
 * Whose name applies here.
 *
 * The person's own where the conversation belongs to one, then the business's,
 * then the default. Two falls with one meaning: nobody has said otherwise.
 *
 * Blank strings count as unset. A name box somebody cleared and saved means
 * "use the default", and storing "" would otherwise produce an assistant that
 * introduces itself as nothing at all.
 */
export function assistantName(
  studio: { assistant_name?: string | null } | null | undefined,
  artist?: { assistant_name?: string | null } | null,
): string {
  const theirs = artist?.assistant_name?.trim();
  if (theirs) return theirs;

  const shop = studio?.assistant_name?.trim();
  if (shop) return shop;

  return DEFAULT_ASSISTANT_NAME;
}
