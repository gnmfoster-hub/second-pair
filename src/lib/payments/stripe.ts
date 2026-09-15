import Stripe from "stripe";
import type { Studio } from "@/lib/types";
import { formatPence } from "@/lib/money";

/**
 * Deposits.
 *
 * Each business is paid directly through Stripe Connect, so money never rests
 * in the platform account — which keeps Second Pair out of the business of holding
 * other people's money, and out of the regulation that comes with it.
 *
 * A business without a connected account can still be demonstrated in test
 * mode, charging the platform account. `readyForRealMoney` is what gates that.
 */

/**
 * Which Stripe a business belongs to.
 *
 * Two, and only ever two: the real one, and Stripe's test mode. A demo that
 * cannot take a payment cannot demonstrate the half of the product that is
 * about money — and putting the whole platform in test mode to show somebody a
 * salon would mean a real business could not take a real deposit while you
 * were doing it.
 *
 * So the mode follows the business rather than the deployment. A demo runs on
 * test keys where they are set and Stripe's own card numbers work on it; every
 * other business is untouched and is on the live keys as before.
 */
export type StripeMode = "live" | "test";

/** Whether a sandbox is set up at all. Without it everything stays live. */
export const testModeReady = () =>
  Boolean(process.env.STRIPE_SECRET_KEY_TEST && process.env.STRIPE_CONNECT_CLIENT_ID_TEST);

/**
 * Demos only, and never by accident.
 *
 * `kind` is set in the back office and nothing a customer can reach changes
 * it. A real business cannot end up on test keys by having the wrong flag
 * passed to it, because the only value that produces test mode is one word
 * written by somebody running the platform.
 */
export function modeFor(business: { kind?: string | null }): StripeMode {
  return business.kind === "demo" && testModeReady() ? "test" : "live";
}

export function secretFor(mode: StripeMode): string | undefined {
  return mode === "test" ? process.env.STRIPE_SECRET_KEY_TEST : process.env.STRIPE_SECRET_KEY;
}

export function connectClientIdFor(mode: StripeMode): string | undefined {
  return mode === "test"
    ? process.env.STRIPE_CONNECT_CLIENT_ID_TEST
    : process.env.STRIPE_CONNECT_CLIENT_ID;
}

const clients: Partial<Record<StripeMode, Stripe>> = {};

export function stripe(mode: StripeMode = "live"): Stripe {
  const key = secretFor(mode);
  if (!key) {
    throw new Error(
      mode === "test" ? "STRIPE_SECRET_KEY_TEST is not set" : "STRIPE_SECRET_KEY is not set",
    );
  }
  clients[mode] ??= new Stripe(key);
  return clients[mode]!;
}

export const stripeConfigured = () => Boolean(process.env.STRIPE_SECRET_KEY);

// The deposit decision itself lives in its own module so it can be tested
// without pulling Stripe in. Re-exported here because this is where callers
// have always looked for it.
export { readyForRealMoney, effectiveDepositMode } from "./depositMode";

/** Stripe requires a session to expire between 30 minutes and 24 hours out. */
function expiryFor(heldUntil: string | null): number {
  const min = Math.floor(Date.now() / 1000) + 31 * 60;
  const max = Math.floor(Date.now() / 1000) + 23 * 3600;
  if (!heldUntil) return min;
  return Math.min(max, Math.max(min, Math.floor(Date.parse(heldUntil) / 1000)));
}

export type DepositCheckout = {
  url: string;
  sessionId: string;
  /**
   * Always false now, and kept so callers do not have to change.
   *
   * It used to mean "this money is landing in our account rather than
   * theirs" — a state nothing checked. That state is refused above instead of
   * described here.
   */
  platformHeld: boolean;
};

export async function createDepositCheckout(args: {
  studio: Studio;
  bookingId: string;
  conversationId: string;
  amountPence: number;
  description: string;
  heldUntil: string | null;
  origin: string;
  clientEmail?: string | null;
  /**
   * Whose account it goes into, when that is not simply the business's — a
   * person paid into their own. Worked out by whoTakes, never by the caller.
   */
  account?: string | null;
}): Promise<DepositCheckout> {
  const {
    studio,
    bookingId,
    conversationId,
    amountPence,
    description,
    heldUntil,
    origin,
    clientEmail,
  } = args;

  if (amountPence <= 0) throw new Error("Deposit amount must be greater than zero.");

  const connected = args.account ?? studio.stripe_account_id;

  /*
   * No connected account, no charge.
   *
   * Without one this fell back to the platform's own Stripe, so a business
   * that switched deposits on before connecting would have had its customers'
   * money land in ours. Nothing said so: the return value carried a
   * platformHeld flag that no caller has ever read.
   *
   * That is the one failure here worth being loud about. Money arriving in the
   * wrong account is not a bug you notice in a log — it is somebody else's
   * deposit sitting in a balance that is not theirs, with a refund, a
   * reconciliation and an awkward conversation attached. Refusing to take it
   * costs a business one booking and tells them exactly what to fix; taking it
   * costs everyone a great deal more.
   */
  if (!connected) {
    throw new Error(
      "This business has not connected its own Stripe account yet, so a deposit " +
        "cannot be taken. Connect one in Settings, or turn deposits off.",
    );
  }

  const params: Stripe.Checkout.SessionCreateParams = {
    mode: "payment",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "gbp",
          unit_amount: amountPence,
          product_data: {
            name: `Deposit — ${studio.name}`,
            description,
          },
        },
      },
    ],
    // Carried back on the webhook; the booking is confirmed from these, never
    // from anything the browser reports.
    metadata: { booking_id: bookingId, conversation_id: conversationId, studio_id: studio.id },
    payment_intent_data: {
      metadata: { booking_id: bookingId, studio_id: studio.id },
      description: `${formatPence(amountPence)} deposit — ${studio.name}`,
    },
    expires_at: expiryFor(heldUntil),
    success_url: `${origin}/pay/done?booking=${bookingId}`,
    cancel_url: `${origin}/pay/cancelled?booking=${bookingId}`,
    ...(clientEmail ? { customer_email: clientEmail } : {}),
  };

  // A direct charge on the connected account: the studio is the merchant of
  // record and the money is theirs from the moment it lands.
  const session = await stripe(modeFor(studio)).checkout.sessions.create(
    params,
    connected ? { stripeAccount: connected } : undefined,
  );

  if (!session.url) throw new Error("Stripe did not return a checkout URL.");

  return { url: session.url, sessionId: session.id, platformHeld: false };
}

export type CheckoutState =
  | { state: "open"; url: string }
  | { state: "paid" }
  | { state: "gone" };

/**
 * Where a checkout session has got to.
 *
 * This only ever answered "is it open", so a session that had already been
 * paid read the same as one that had expired — and the short link made a new
 * checkout for it. A customer who paid, saw "confirming your payment", and
 * tapped the link in the chat again while they waited was charged twice.
 */
export async function checkoutState(
  studio: Studio,
  sessionId: string,
  account?: string | null,
): Promise<CheckoutState> {
  const on = account ?? studio.stripe_account_id;
  try {
    const session = await stripe(modeFor(studio)).checkout.sessions.retrieve(
      sessionId,
      undefined,
      on ? { stripeAccount: on } : undefined,
    );
    if (session.status === "complete" || session.payment_status === "paid") return { state: "paid" };
    if (session.status === "open" && session.url) return { state: "open", url: session.url };
    return { state: "gone" };
  } catch {
    return { state: "gone" };
  }
}

/** The URL of a checkout session, if it is still open and payable. */
export async function retrieveOpenCheckout(
  studio: Studio,
  sessionId: string,
  account?: string | null,
): Promise<string | null> {
  const now = await checkoutState(studio, sessionId, account);
  return now.state === "open" ? now.url : null;
}

/*
 * There is deliberately no refund here.
 *
 * A function called refundDeposit stood in this spot, exported, working, and
 * called by nothing — which is worse than an empty space, because anybody
 * reading this file would reasonably conclude the product can refund and go
 * looking for the button.
 *
 * It cannot, on purpose. These are Standard connected accounts: the business
 * is the merchant of record and the money is theirs from the moment it lands,
 * so refunds, disputes and chargebacks are settled in their own Stripe
 * dashboard. A refund from here would be us moving money out of somebody
 * else's balance. What the product does instead is link to the exact charge,
 * from the client's record, which is the useful half — the slow part of a
 * refund is finding the payment among three hundred.
 */
