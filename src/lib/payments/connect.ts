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

/**
 * The cookie holding the nonce of the connection being made.
 *
 * The signed state proves which business a callback is for; it does not prove
 * it is the same browser that started. Without that, an owner could be handed
 * an authorise link and, by approving it, attach their own Stripe or Facebook
 * page to somebody else's business. Written when the flow starts, checked when
 * it comes back, and cleared either way.
 *
 * Lax rather than strict: the browser is arriving back from Stripe's domain,
 * and a strict cookie is not sent on that navigation at all.
 */
export const CONNECT_NONCE_COOKIE = "sp_connect_nonce";

export type ConnectState = {
  /** Which business is connecting. */
  studio: string;
  /**
   * Which person, where this is one of them connecting rather than the shop.
   *
   * A salon of chair renters pays each person directly, and their money has to
   * land in an account that is theirs: their ID, their bank details, their
   * liability. So the account belongs to the person, and the business is only
   * the context it was set up in.
   *
   * Absent means the business's own, which is what every connection was until
   * now and stays the common case.
   */
  artist?: string;
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

/**
 * Whether Stripe recognises a Connect client id, asked of Stripe.
 *
 * Health reported "businesses can connect their Stripe" off the variable merely
 * being set, and on the day somebody pressed Connect it opened a black page
 * reading `No application matches the supplied client identifier`. A value can
 * be present and wrong in several ordinary ways — the live id next to a test
 * key, an id from the main account next to a key from a sandbox, OAuth never
 * switched on — and every one of them looks identical to "set" from here.
 *
 * So it follows the same authorise URL a business would be sent to and reads
 * the answer. An unknown id redirects to a 400 with that exact message; a real
 * one lands on Stripe's sign-in page. Nothing is created and nobody is
 * connected — it is the first page of the flow, fetched and thrown away.
 *
 * Null when Stripe could not be reached to ask, which is not the same as no.
 */
export async function probeClientId(clientId: string | undefined): Promise<boolean | null> {
  if (!clientId) return false;

  try {
    const url = new URL("https://connect.stripe.com/oauth/authorize");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "read_write");
    url.searchParams.set("client_id", clientId);

    const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(8000) });
    if (res.status >= 500) return null;

    const body = await res.text();
    if (/no application matches/i.test(body)) return false;

    return res.status < 400;
  } catch {
    return null;
  }
}

/**
 * Whether a Connect client id and a secret key belong to the same Stripe.
 *
 * Stripe accepting the id is not enough. A sandbox, the main account's test
 * mode and every other sandbox each have their own id and their own keys, and
 * an id from one next to a key from another passes every check right up to
 * the last step: somebody fills in Stripe's form, comes back, and the exchange
 * fails with "Authorization code provided does not belong to you".
 *
 * Asked by deauthorising an account that does not exist. Stripe checks the
 * application against the key first — an id the key does not own is refused
 * as an unknown application — and only then looks for the account, which is
 * never there. Nothing is connected or disconnected either way.
 *
 * Null when Stripe could not be reached, or answered in a way this does not
 * recognise, which is not the same as no.
 */
export async function probeClientIdMatchesKey(
  clientId: string | undefined,
  secret: string | undefined,
): Promise<boolean | null> {
  return (await probeClientIdAgainstKey(clientId, secret)).matches;
}

/** The same question, with Stripe's own sentence kept for whoever is fixing it. */
export async function probeClientIdAgainstKey(
  clientId: string | undefined,
  secret: string | undefined,
): Promise<{ matches: boolean | null; said: string | null }> {
  if (!clientId || !secret) return { matches: false, said: null };

  try {
    const res = await fetch("https://connect.stripe.com/oauth/deauthorize", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Bearer ${secret}`,
      },
      body: new URLSearchParams({ client_id: clientId, stripe_user_id: "acct_1SecondPairProbe0" }),
      signal: AbortSignal.timeout(8000),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string; error_description?: string };
    const said = `${body.error ?? ""}: ${body.error_description ?? ""}`.slice(0, 200);
    if (res.status >= 500) return { matches: null, said };

    if (/no such application|does not belong|no application matches/i.test(said)) {
      return { matches: false, said };
    }
    // Refused over the account, which means the application itself was fine.
    if (/account|user/i.test(said)) return { matches: true, said };
    return { matches: null, said };
  } catch {
    return { matches: null, said: null };
  }
}

/**
 * Which Stripe a secret key belongs to, by name — the one thing to compare
 * against the account switcher when the id and the key do not match.
 */
export async function keyAccountName(secret: string | undefined): Promise<string | null> {
  if (!secret) return null;
  try {
    const res = await fetch("https://api.stripe.com/v1/account", {
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      settings?: { dashboard?: { display_name?: string } };
      business_profile?: { name?: string };
    };
    return body.settings?.dashboard?.display_name ?? body.business_profile?.name ?? null;
  } catch {
    return null;
  }
}
