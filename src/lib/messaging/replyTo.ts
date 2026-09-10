/**
 * Where a customer's reply should land.
 *
 * This was the business's own address, which sounds right and quietly ends the
 * conversation. The assistant emails somebody asking what sort of clean they
 * are after; they hit reply; the answer goes to the owner's inbox, where the
 * owner is up a ladder. The assistant never hears it, never answers, and the
 * customer is left waiting on a question it asked them. Every email
 * conversation was one exchange long by construction.
 *
 * It points back at us now, at the address that business receives on, so a
 * reply carries on the conversation exactly as a second text message does. The
 * owner has not lost anything: they see the whole thread in the dashboard, and
 * the assistant answers rather than them.
 *
 * Only when we can actually receive it. Until inbound email is switched on, a
 * reply sent there would fall down a hole, so it goes to the business as
 * before — worse, but not lost.
 */

/** Where the platform receives mail for businesses. */
export function inboundDomain(): string {
  return (process.env.EMAIL_INBOUND_DOMAIN ?? "in.second-pair.com").toLowerCase();
}

/**
 * Whether a reply sent to us would actually arrive.
 *
 * The webhook secret is the honest signal: nothing is accepted at all until it
 * is set, so without it every reply to an address of ours is discarded in
 * silence. Better to hand replies to the business than into a void.
 */
export function canReceiveEmail(): boolean {
  return Boolean(process.env.EMAIL_WEBHOOK_SECRET);
}

/**
 * The address to put in Reply-To.
 *
 * Falls back to the business's own, and then to nothing at all — never to a
 * broken value, since a Reply-To the mail server refuses takes the whole
 * message down with it.
 */
export function replyToFor(studio: { slug: string; email?: string | null }): string | undefined {
  if (canReceiveEmail() && studio.slug) {
    return `${studio.slug}@${inboundDomain()}`;
  }
  return studio.email ?? undefined;
}
