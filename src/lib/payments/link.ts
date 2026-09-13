import Stripe from "stripe";
import { stripe } from "./stripe";
import { whoTakes, type BusinessMoney, type PersonMoney, type MoneyKind } from "./whoTakes";
import { formatPence } from "@/lib/money";
import { expiryFor } from "./expiry";

/**
 * A link that asks somebody to pay, from anywhere in the product.
 *
 * Deposits have had one of these since they were built, and it could only ever
 * be made in one place: the moment the assistant took a booking. Every other
 * time money is owed — a balance on the day, a client who wants to pay for
 * next month's course up front, two bottles somebody is collecting on Friday —
 * a business had to reach for something else, which in practice means a card
 * machine they are stood next to or a bank transfer nobody chases.
 *
 * So this is the general form of the thing that already worked. The decision
 * about whose account it lands in is not made here — it is made by whoTakes,
 * which is pure and tested and is the same decision for a deposit, a balance
 * and a bottle of shampoo. What is left for this file is Stripe.
 *
 * A direct charge on the connected account, exactly as deposits are: the
 * business is the merchant of record, the money is theirs from the moment it
 * lands, and it never passes through us.
 */

export type PaymentLink = {
  url: string;
  sessionId: string;
  /** Which Stripe account it will land in. Recorded, so it can be audited. */
  account: string;
  whose: "business" | "person";
  /** True where it went to the business because that person has no account. */
  fellBack: boolean;
};

export async function createPaymentLink(args: {
  business: BusinessMoney & { id: string; name: string };
  /** Who the work is for, and whose takings it is. Null for the shop's own. */
  person: (PersonMoney & { name?: string | null }) | null;
  kind: MoneyKind;
  amountPence: number;
  /** What it is for, in the business's own words. Shown on the Stripe page. */
  description: string;
  origin: string;
  /** The row in our own payments table, carried back by the webhook. */
  paymentId: string;
  bookingId?: string | null;
  contactId?: string | null;
  clientEmail?: string | null;
  /**
   * When the link stops working.
   *
   * A payment link with no end is a link that turns up in a text message
   * eighteen months later and charges somebody for an appointment they have
   * long since had. Stripe's own minimum is half an hour and its maximum is
   * 24 hours from now.
   */
  expiresAt?: number | null;
}): Promise<PaymentLink> {
  const { business, person, kind, amountPence, description, origin, paymentId } = args;

  if (!Number.isInteger(amountPence) || amountPence <= 0) {
    throw new Error("A payment has to be for a real amount.");
  }

  /*
   * May this person take this kind of money, and where does it go.
   *
   * Asked before Stripe is touched, because every refusal here is a sentence
   * somebody can act on — a switch, a connect flow, or a word with the owner —
   * and none of them is improved by a Stripe error on top.
   */
  const verdict = whoTakes(business, person, kind);
  if (!verdict.ok) throw new Error(verdict.because);

  const label =
    kind === "deposit" ? `Deposit — ${business.name}` : `${business.name}`;

  const params: Stripe.Checkout.SessionCreateParams = {
    mode: "payment",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "gbp",
          unit_amount: amountPence,
          product_data: { name: label, description },
        },
      },
    ],
    /*
     * Everything the webhook needs to close this out, carried by Stripe.
     *
     * Our own payment id above all: it is what turns "somebody paid" into
     * "this row, for this client, for this person's takings". Without it a
     * payment arrives with nothing to attach it to and the tax export is
     * short by exactly the amount that was easiest to take.
     */
    metadata: {
      payment_id: paymentId,
      studio_id: business.id,
      kind,
      ...(args.bookingId ? { booking_id: args.bookingId } : {}),
      ...(args.contactId ? { contact_id: args.contactId } : {}),
    },
    payment_intent_data: {
      metadata: { payment_id: paymentId, studio_id: business.id },
      description: `${formatPence(amountPence)} — ${description}`,
    },
    success_url: `${origin}/pay/done?payment=${paymentId}`,
    cancel_url: `${origin}/pay/cancelled?payment=${paymentId}`,
    ...(args.clientEmail ? { customer_email: args.clientEmail } : {}),
    /*
     * Always an expiry, never none.
     *
     * A day by default, which is the longest Stripe allows and long enough for
     * somebody to pay when they get in from work. Defaulted here rather than
     * left to each caller, because this will be sent from four screens and the
     * one that forgot would be the one that put a live payment link in a text
     * message for ever.
     */
    expires_at: args.expiresAt ?? expiryFor(24),
  };

  const session = await stripe().checkout.sessions.create(params, {
    stripeAccount: verdict.account,
  });

  if (!session.url) throw new Error("Stripe did not return a payment link.");

  return {
    url: session.url,
    sessionId: session.id,
    account: verdict.account,
    whose: verdict.whose,
    fellBack: verdict.fellBack === true,
  };
}

