import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatPence } from "@/lib/money";
import { stripe, modeFor } from "@/lib/payments/stripe";

export const dynamic = "force-dynamic";

/**
 * Where somebody lands after paying.
 *
 * It said "Payment received — your appointment is held in the meantime" to
 * everybody, which is a deposit's sentence: somebody settling a £55 restyle
 * after the event was told an appointment they had already had was being held.
 * And it was a dead end — no way back to the business, so a customer who paid
 * from a text was left on a page of ours with nothing to press.
 *
 * Now it says what was paid, what for, and to whom, and whether it was a
 * deposit or the whole thing.
 *
 * Asked of Stripe as well as of our own table. The table is only updated when
 * Stripe's notification arrives, which is usually a second and occasionally a
 * minute; the customer is standing here now, and Stripe already knows. Reading
 * it is not trusting the URL — the session is looked up server-side by the id
 * we stored, on the account it was made on. Nothing is written from here: the
 * webhook stays the one thing that records money.
 */
export default async function PaymentDonePage({
  searchParams,
}: {
  searchParams: Promise<{ booking?: string; payment?: string }>;
}) {
  const { booking: bookingId, payment: paymentId } = await searchParams;
  const db = createAdminClient();

  let kind: "deposit" | "payment" = "deposit";
  let paid = false;
  let amount = 0;
  let what: string | null = null;
  let business: { name: string; slug: string; timezone: string | null } | null = null;
  let startsAt: string | null = null;

  if (paymentId) {
    const { data: payment } = await db
      .from("payments")
      .select("*, studios(name, slug, timezone, kind)")
      .eq("id", paymentId)
      .maybeSingle();

    if (payment) {
      const studio = payment.studios as {
        name: string;
        slug: string;
        timezone: string | null;
        kind: string | null;
      } | null;
      business = studio;
      kind = payment.kind === "deposit" ? "deposit" : "payment";
      amount = (payment.gross_pence as number) ?? 0;
      what = (payment.description as string | null) ?? null;
      paid = payment.status === "paid";

      if (!paid && payment.stripe_session_id && payment.destination_account && studio) {
        try {
          const session = await stripe(modeFor(studio)).checkout.sessions.retrieve(
            payment.stripe_session_id as string,
            {},
            { stripeAccount: payment.destination_account as string },
          );
          paid = session.payment_status === "paid";
        } catch {
          // Stripe unreachable: say it is being confirmed, which is true.
        }
      }

      if (payment.booking_id) {
        const { data: b } = await db
          .from("bookings")
          .select("starts_at")
          .eq("id", payment.booking_id)
          .maybeSingle();
        startsAt = (b?.starts_at as string | null) ?? null;
      }
    }
  } else if (bookingId) {
    const { data } = await db
      .from("bookings")
      .select("starts_at, deposit_status, deposit_amount_pence, artists(studios(name, slug, timezone))")
      .eq("id", bookingId)
      .maybeSingle();
    paid = data?.deposit_status === "paid";
    amount = data?.deposit_amount_pence ?? 0;
    startsAt = (data?.starts_at as string | null) ?? null;
    business =
      ((data?.artists as unknown as { studios: typeof business } | null)?.studios as typeof business) ??
      null;
  }

  // A deposit is for something still to come; a payment may be for today's.
  const upcoming = startsAt && stillToCome(startsAt) ? startsAt : null;
  const when = upcoming
    ? new Intl.DateTimeFormat("en-GB", {
        timeZone: business?.timezone ?? "Europe/London",
        weekday: "long",
        day: "numeric",
        month: "long",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }).format(new Date(upcoming))
    : null;

  const to = business?.name ? ` to ${business.name}` : "";

  let heading: string;
  let body: string;

  if (!paid) {
    heading = "Confirming your payment";
    body =
      "Your card has gone through to the payment provider and this page is waiting for them to confirm it. It usually takes a few seconds and updates by itself.";
  } else if (kind === "deposit") {
    heading = "Deposit paid";
    body = `${formatPence(amount)} paid${to}.${
      when ? ` Your appointment on ${when} is confirmed.` : " Your appointment is confirmed."
    }`;
  } else {
    heading = "Payment received";
    body = `${formatPence(amount)} paid${to}${what ? ` for ${what}` : ""}. Thank you${
      when ? ` — see you on ${when}` : ""
    }.`;
  }

  return (
    <div className="grid min-h-screen place-items-center px-6 text-center">
      {/* Look again every few seconds until Stripe has confirmed it. */}
      {!paid && <meta httpEquiv="refresh" content="4" />}
      <div className="max-w-sm">
        <div className="text-3xl" aria-hidden>
          {paid ? "✓" : "⏳"}
        </div>
        <h1 className="mt-4 text-lg font-semibold tracking-tight">{heading}</h1>
        <p className="hint mt-2">{body}</p>
        {paid && (
          <p className="hint mt-2 text-sm">
            Your card statement will show the payment. You can close this page.
          </p>
        )}

        {/* Somewhere to go, rather than a page of ours with nothing on it. */}
        {business?.slug && (
          <Link
            href={`/widget/${business.slug}`}
            className="btn mt-6 inline-flex border border-border"
          >
            Back to {business.name}
          </Link>
        )}
      </div>
    </div>
  );
}

/** Whether an appointment is still ahead. Out of the render, where reading the clock belongs. */
function stillToCome(iso: string): boolean {
  return Date.parse(iso) > Date.now();
}
