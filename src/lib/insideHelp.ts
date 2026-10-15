/**
 * Which studio is the help assistant inside the product.
 *
 * Separate from NEXT_PUBLIC_SUPPORT_SLUG on purpose, and that separation is
 * the whole point of the change. One studio was answering both the public
 * website and the dashboard help button, so the same brief had to serve
 * somebody deciding whether to buy and somebody who has bought and is stuck.
 *
 * Giles, 15 October: "the internal help one needs to be different as its only
 * to help with issues on the second pair back end where the client logs in. i
 * dont want the second pair marketing agent touched either."
 *
 * So the marketing assistant keeps `help`, with its wording, its FAQs and the
 * enquiries already attached to it, and nothing here points at it.
 *
 * A default rather than a required variable: the slug is ours, not a
 * customer's, and a help button that silently stops working because an
 * environment variable was not copied into Vercel is a worse failure than a
 * hard-coded name. The variable remains as a way out.
 */
export const INSIDE_SLUG = process.env.NEXT_PUBLIC_INSIDE_SLUG?.trim() || "inside";

/** Whether this is the assistant that helps a client work the product. */
export function isInsideHelp(slug: string | null | undefined): boolean {
  return Boolean(slug) && slug === INSIDE_SLUG;
}
