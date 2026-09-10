import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";

/**
 * Letting a business connect their own Facebook Page and Instagram.
 *
 * They press a button, land on Facebook, log in as themselves, and agree to
 * what Second Pair is asking for. Meta hands us a token for their account
 * alone. Nobody here ever sees their password, and they can take it back from
 * their own Facebook settings without asking us.
 *
 * The parts that decide who is allowed to do what live here, away from the
 * network, so they can be tested. Everything a stranger could tamper with —
 * the round trip through Facebook and back — depends on them.
 */

/**
 * What we ask a business for, and nothing beyond it.
 *
 * Read their pages, read and send messages on them, and read the Instagram
 * account attached. Deliberately not `pages_read_engagement`, or anything
 * touching posts, adverts or insights: every extra permission is another line
 * on the screen where they decide whether to trust us, and another thing to
 * justify at review.
 */
export const SCOPES = [
  "pages_show_list",
  "pages_messaging",
  "instagram_basic",
  "instagram_manage_messages",
  "business_management",
] as const;

/**
 * The state parameter, which is the whole security of this.
 *
 * It travels to Facebook and back, and on the way back it is the only thing
 * telling us that this is the same person who started, connecting the business
 * they were allowed to connect. Unsigned, anybody could send somebody a link
 * that quietly attaches their own Facebook Page to a stranger's business.
 *
 * So it carries the studio, a nonce and a timestamp, signed with a secret only
 * the server holds.
 */
export type ConnectState = { studioId: string; nonce: string; at: number };

const SEPARATOR = ".";

export function signState(state: ConnectState, secret: string): string {
  const body = Buffer.from(JSON.stringify(state), "utf8").toString("base64url");
  const mac = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}${SEPARATOR}${mac}`;
}

/**
 * Reads it back, or returns null.
 *
 * Null for anything at all wrong: tampered, unsigned, from a different secret,
 * or simply old. Fifteen minutes is far longer than logging in to Facebook
 * takes and short enough that a link left in a browser history is no use.
 */
export function readState(
  token: string,
  secret: string,
  now = Date.now(),
  maxAgeMs = 15 * 60 * 1000,
): ConnectState | null {
  if (!secret || !token) return null;

  const [body, mac] = token.split(SEPARATOR);
  if (!body || !mac) return null;

  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const a = Buffer.from(expected);
  const b = Buffer.from(mac);
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  const state = parsed as Partial<ConnectState>;
  if (typeof state.studioId !== "string" || !state.studioId) return null;
  if (typeof state.nonce !== "string" || !state.nonce) return null;
  if (typeof state.at !== "number" || !Number.isFinite(state.at)) return null;

  // A timestamp from the future is a tampered one, whatever the signature says.
  if (state.at > now + 60_000) return null;
  if (now - state.at > maxAgeMs) return null;

  return { studioId: state.studioId, nonce: state.nonce, at: state.at };
}

export function newNonce(): string {
  return randomBytes(16).toString("base64url");
}

/** Where to send them, with everything Facebook needs to show the right screen. */
export function authoriseUrl({
  appId,
  redirectUri,
  state,
}: {
  appId: string;
  redirectUri: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    state,
    scope: SCOPES.join(","),
    response_type: "code",
  });
  return `https://www.facebook.com/v21.0/dialog/oauth?${params}`;
}

/**
 * What a business actually connected, out of what Facebook sent back.
 *
 * One agreement can cover several Pages — somebody who runs a shop and a
 * side project sees both listed and may tick both. Each becomes its own
 * connection, and each carries its own token: a Page token only works for
 * that Page, which is exactly the blast radius we want.
 */
export type ConnectedAccount = {
  channel: "messenger" | "instagram";
  /** The Page id, or the Instagram account id. */
  externalId: string;
  /** What to call it on screen. */
  label: string;
  /** The Page token. Instagram messaging runs on the Page's token too. */
  token: string;
};

type Bag = Record<string, unknown>;
const obj = (v: unknown): Bag => (v && typeof v === "object" ? (v as Bag) : {});
const str = (v: unknown): string => (typeof v === "string" ? v : "");

/**
 * Turns Facebook's answer into connections.
 *
 * A Page with an Instagram account attached gives two: people message a
 * business on both and expect the same answer, and keeping them separate is
 * what lets one be switched off without the other.
 */
export function accountsFrom(payload: unknown): ConnectedAccount[] {
  const out: ConnectedAccount[] = [];

  for (const raw of (obj(payload).data as unknown[]) ?? []) {
    const page = obj(raw);
    const id = str(page.id);
    const token = str(page.access_token);
    const name = str(page.name) || "Facebook Page";
    if (!id || !token) continue;

    out.push({ channel: "messenger", externalId: id, label: name, token });

    const ig = obj(page.instagram_business_account);
    const igId = str(ig.id);
    if (igId) {
      const username = str(ig.username);
      out.push({
        channel: "instagram",
        externalId: igId,
        label: username ? `@${username}` : `${name} on Instagram`,
        token,
      });
    }
  }

  return out;
}
