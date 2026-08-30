import Stripe from "stripe";
import type { Studio } from "@/lib/types";
import { formatPence } from "@/lib/money";

/**
 * Deposits.
 *
 * Each business is paid directly through Stripe Connect, so money never rests
 * in the platform account — which keeps Handled out of the business of holding
 * other people's money, and out of the regulation that comes with it.
 *
 * A business without a connected account can still be demonstrated in test
 * mode, charging the platform account. `readyForRealMoney` is what gates that.
 */

let client: Stripe | null = null;

export function stripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not set");
  }
  client ??= new Stripe(process.env.STRIPE_SECRET_KEY);
  return client;
}

export const stripeConfigured = () => Boolean(process.env.STRIPE_SECRET_KEY);

/** True once deposits would actually reach the business rather than the platform. */
export const readyForRealMoney = (studio: Studio) => Boolean(studio.stripe_account_id);

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
  /** True when the money would land in the platform account, not the studio's. */
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

  const connected = studio.stripe_account_id;

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
  const session = await stripe().checkout.sessions.create(
    params,
    connected ? { stripeAccount: connected } : undefined,
  );

  if (!session.url) throw new Error("Stripe did not return a checkout URL.");

  return { url: session.url, sessionId: session.id, platformHeld: !connected };
}

/** The URL of a checkout session, if it is still open and payable. */
export async function retrieveOpenCheckout(
  studio: Studio,
  sessionId: string,
): Promise<string | null> {
  try {
    const session = await stripe().checkout.sessions.retrieve(
      sessionId,
      undefined,
      studio.stripe_account_id ? { stripeAccount: studio.stripe_account_id } : undefined,
    );
    return session.status === "open" && session.url ? session.url : null;
  } catch {
    return null;
  }
}

/** Refund a deposit, e.g. when the studio cancels. */
export async function refundDeposit(
  studio: Studio,
  paymentIntentId: string,
): Promise<boolean> {
  try {
    await stripe().refunds.create(
      { payment_intent: paymentIntentId },
      studio.stripe_account_id ? { stripeAccount: studio.stripe_account_id } : undefined,
    );
    return true;
  } catch {
    return false;
  }
}
