import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Sending a business off to Stripe to connect their own account.
 *
 * Standard accounts, deliberately. The business signs in to Stripe — or signs
 * up there and then — and comes back connected. From that point their
 * customers pay them directly: they are the merchant of record, the money
 * never touches an account of ours, and refunds, disputes and chargebacks are
 * theirs to settle in their own Stripe dashboard.
 *
 * That is the whole point. Express and Custom accounts would let us control
 * more of the experience and would make Second Pair responsible for losses on
 * accounts it does not own — which is a payments business, not a booking one.
 *
 * Until now the only way to connect was to paste an acct_ id into a text box
 * on the settings page, which no salon owner was ever going to do. So in
 * practice nobody was connected, and deposits had nowhere of their own to
 * land.
 */

const SEPARATOR = ".";

export type ConnectState = {
  /** Which business is connecting. */
  studio: string;
  /** Random, so a state token cannot be replayed. */
  nonce: string;
  /** When it was made, in milliseconds. */
  at: number;
};

/**
 * A state token Stripe hands back to us untouched.
 *
 * Signed rather than stored: the callback has to know which business it is
 * for, and taking that from a query parameter without proof would let anybody
 * connect their Stripe account to somebody else's business.
 */
export function signState(state: ConnectState, secret: string): string {
  const body = Buffer.from(JSON.stringify(state), "utf8").toString("base64url");
  const mac = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}${SEPARATOR}${mac}`;
}

/**
 * Reads it back, or null for anything at all wrong.
 *
 * Tampered, unsigned, signed with another secret, or simply old. Fifteen
 * minutes is far longer than connecting a Stripe account takes and short
 * enough that a link left in a browser history is no use to anybody.
 */
export function readState(
  token: string,
  secret: string,
  now = Date.now(),
  maxAgeMs = 15 * 60 * 1000,
): ConnectState | null {
  const cut = token.lastIndexOf(SEPARATOR);
  if (cut <= 0) return null;

  const body = token.slice(0, cut);
  const mac = token.slice(cut + 1);
  const expected = createHmac("sha256", secret).update(body).digest("base64url");

  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const state = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as ConnectState;
    if (!state.studio || !state.nonce || typeof state.at !== "number") return null;
    if (now - state.at > maxAgeMs) return null;
    return state;
  } catch {
    return null;
  }
}

export function newNonce(): string {
  return randomBytes(16).toString("base64url");
}

/**
 * Where to send them.
 *
 * read_write because we create checkout sessions on their behalf. The business
 * sees exactly that on Stripe's own consent screen, in Stripe's words rather
 * than ours, which is the right place for somebody to decide whether to trust
 * this with their takings.
 */
export function authoriseUrl({
  clientId,
  redirectUri,
  state,
  email,
  businessName,
}: {
  clientId: string;
  redirectUri: string;
  state: string;
  email?: string | null;
  businessName?: string | null;
}): string {
  const url = new URL("https://connect.stripe.com/oauth/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("scope", "read_write");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);

  /*
   * Prefilled, so somebody who has never used Stripe is not starting from an
   * empty form. Stripe treats these as suggestions and the business can change
   * any of it — they are filling in their own company details, not ours.
   */
  if (email) url.searchParams.set("stripe_user[email]", email);
  if (businessName) url.searchParams.set("stripe_user[business_name]", businessName);
  url.searchParams.set("stripe_user[country]", "GB");

  return url.toString();
}
