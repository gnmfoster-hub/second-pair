/**
 * Pulling a bare address out of whatever shape somebody wrote it in.
 *
 * An address in the wild is rarely just an address. It is a display name
 * wrapped round one, because that is what mail clients write and what every
 * setup guide tells you to type — `Second Pair <hello@second-pair.com>`.
 *
 * This started life inside the inbound reader, where taking the first thing
 * before the "@" gave "the fold hair <demo-fold" and dropped the enquiry. It
 * lives here because the sending side has exactly the same problem with
 * exactly the same value, and had it for as long.
 */

/** The address itself, without any name wrapped round it. */
export function addressOf(raw: string): string {
  const angled = /<([^>]+)>/.exec(raw);
  return (angled ? angled[1] : raw).trim().toLowerCase();
}

/** The bit after the @, or "" if there is not one. */
export function domainOf(raw: string): string {
  const one = addressOf(raw);
  const at = one.lastIndexOf("@");
  return at === -1 ? "" : one.slice(at + 1);
}

/**
 * The From line to send under.
 *
 * `EMAIL_FROM` may already carry a name, since that is the form every guide
 * shows. Wrapping the business's name round it unread produced
 * `Living Canvas Tattoo <Second Pair <hello@second-pair.com>>`, which is not a
 * From line any mail server will take — so the first send after the key was
 * fixed would have failed for a completely different reason, with nothing to
 * connect the two.
 *
 * The business's name wins when there is one: their customer should see the
 * business, not us.
 */
export function senderLine(from: string, name?: string): string {
  const address = addressOf(from);
  if (!name?.trim()) return from.trim();
  // A quote or a bracket in a business name would break the header it is being
  // put into, and a salon called "Bella's" is not a strange name.
  const safe = name.replace(/["\<>]/g, "").trim();
  return safe ? `${safe} <${address}>` : address;
}

/**
 * Whether this is an address a mail server will take, or nothing.
 *
 * Deliberately not a full RFC 5322 validator — those accept things no real
 * person types and reject things they do. This catches the shapes that break a
 * header: a comma or a semicolon (both separate addresses, so one address
 * silently becomes two), angle brackets, quotes, whitespace, a missing @, or a
 * domain with no dot in it.
 *
 * It exists because `info@neatandtidysolutions.co,uk` was typed into a
 * settings box — a comma where a full stop belonged, invisible at a glance —
 * and went straight through to the mail API as the reply-to on every message.
 * Resend refused each one outright, so no customer of that business could be
 * answered at all, and nothing anywhere said why.
 */
export function usableAddress(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const one = addressOf(raw);
  if (!one || /[\s,;<>"()\[\]\\]/.test(one)) return null;

  const at = one.lastIndexOf("@");
  if (at <= 0 || at === one.length - 1) return null;

  const domain = one.slice(at + 1);
  // A dot, and something either side of it. "user@localhost" is valid on a
  // network and never what a business meant to type.
  if (!/^[^.]+(\.[^.]+)+$/.test(domain)) return null;

  return one;
}
