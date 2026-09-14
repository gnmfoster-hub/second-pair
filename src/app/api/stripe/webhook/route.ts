import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { stripe, type StripeMode } from "@/lib/payments/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendBookingConfirmation } from "@/lib/messaging/confirmation";
import { sendPaymentReceipt } from "@/lib/messaging/receipt";
import { alertNewBooking } from "@/lib/notify";

export const runtime = "nodejs";

/**
 * Stripe's word on whether money moved.
 *
 * A booking is only ever confirmed from here — never from the browser landing
 * on the success page, which a client could reach without paying. The signature
 * check is what makes this trustworthy, so an unverified request is refused
 * rather than processed optimistically.
 */
export async function POST(request: NextRequest) {
  /*
   * Two signing secrets, because there are two Stripes.
   *
   * A demo business runs on test keys so it can be shown taking a payment
   * without one changing hands, and Stripe signs a test event with the test
   * endpoint's own secret. Both are tried and the event is only trusted if one
   * of them verifies it — which is the same guarantee as before, twice.
   *
   * Nothing is relaxed by this. An unsigned request is still refused, and a
   * request signed with neither secret is still refused; what changes is that
   * "neither" now means neither of two rather than not the only one.
   */
  const secrets: { mode: StripeMode; secret: string }[] = [
    { mode: "live", secret: process.env.STRIPE_WEBHOOK_SECRET ?? "" },
    { mode: "test", secret: process.env.STRIPE_WEBHOOK_SECRET_TEST ?? "" },
  ].filter((s): s is { mode: StripeMode; secret: string } => Boolean(s.secret));

  if (secrets.length === 0) {
    console.error("[stripe] no webhook secret is set — refusing to trust the event");
    return NextResponse.json({ error: "Webhooks not configured" }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Unsigned" }, { status: 400 });

  const body = await request.text();

  let event: Stripe.Event | null = null;
  let lastError = "";

  for (const { mode, secret } of secrets) {
    try {
      event = stripe(mode).webhooks.constructEvent(body, signature, secret);
      break;
    } catch (error) {
      lastError = (error as Error).message;
    }
  }

  if (!event) {
    console.error("[stripe] bad signature", lastError);
    return NextResponse.json({ error: "Bad signature" }, { status: 400 });
  }

  const db = createAdminClient();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const bookingId = session.metadata?.booking_id;
      const conversationId = session.metadata?.conversation_id;

      // payment_status guards against a session completing without funds, which
      // is possible with delayed payment methods.
      if (session.payment_status !== "paid") break;

      /*
       * A payment link, which may or may not belong to an appointment.
       *
       * This used to begin "no booking id, nothing to do" and stop, which was
       * right while the only thing anybody could pay for was a deposit on a
       * booking. Every link the product can now send — a balance on the day, a
       * course paid up front, two bottles being collected on Friday — carries
       * the id of its own row instead, and not one of them would have been
       * recorded: the customer pays, Stripe is content, and the quarter's
       * takings are short by exactly the amount that was easiest to take.
       *
       * Claimed once, like the booking below it. Stripe retries a webhook
       * whenever it does not get a clean answer quickly enough, and a payment
       * counted twice is a figure somebody does a tax return from.
       */
      const paymentId = session.metadata?.payment_id;
      if (paymentId) {
        const { data: tookIt, error: payError } = await db
          .from("payments")
          .update({
            status: "paid",
            paid_at: new Date().toISOString(),
            // What actually arrived, which is Stripe's figure rather than the
            // one we asked for. They can differ, and theirs is the true one.
            gross_pence: session.amount_total ?? undefined,
            stripe_payment_intent_id:
              typeof session.payment_intent === "string" ? session.payment_intent : null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", paymentId)
          .neq("status", "paid")
          .select("id");

        /*
         * Worth failing on, for the same reason as the booking below: Stripe
         * retrying a payment we could not record is exactly what retries are
         * for, and answering 200 would lose it silently.
         */
        if (payError) {
          console.error("[stripe] could not record payment", payError.message);
          return NextResponse.json({ error: "Could not record" }, { status: 500 });
        }

        /*
         * The receipt, and only on the delivery that actually claimed the row.
         *
         * The claim already refused to touch a payment marked paid, but
         * nothing asked whether it had changed anything — which was harmless
         * while the only thing after it was another write of the same values,
         * and stops being harmless the moment an email hangs off it. Stripe
         * retries whenever it does not get a clean answer quickly enough, and
         * a customer receiving three identical receipts for one payment is a
         * business that looks like it has lost track of their money.
         *
         * Not for a deposit taken while booking: that has no payment_id here,
         * takes the branch below, and sends a confirmation of its own.
         */
        if (tookIt?.length) await sendPaymentReceipt(db, paymentId);
      }

      if (!bookingId) break;

      /*
       * Claimed once, and only once.
       *
       * Stripe retries a webhook whenever it does not get a clean answer
       * quickly enough — a slow email, a cold start, a blip. Setting the
       * booking to paid twice is harmless because it lands on the same values,
       * but the two things after it are not: the customer would get a second
       * confirmation with a second calendar invite, and the owner would find
       * "Deposit paid" written into the conversation twice.
       *
       * So the update refuses to touch a booking that is already paid, and
       * says whether it changed anything. Nothing was changed means somebody
       * else has already done all of this, and there is nothing left to do but
       * answer politely so Stripe stops asking.
       */
      const { data: claimed, error: claimError } = await db
        .from("bookings")
        .update({
          deposit_status: "paid",
          stripe_session_id: session.id,
          // The hold becomes a real booking, so it stops being swept.
          held_until: null,
        })
        .eq("id", bookingId)
        .neq("deposit_status", "paid")
        .select("id");

      /*
       * An error is the one case worth failing on. Stripe retrying a payment
       * we could not record is exactly what retries are for — whereas
       * answering 200 would lose the payment silently.
       */
      if (claimError) {
        console.error("[stripe] could not record payment", claimError.message);
        return NextResponse.json({ error: "Could not record" }, { status: 500 });
      }

      // Already done by an earlier delivery of this same event.
      if (!claimed?.length) break;

      /*
       * A deposit is a transaction too, and it was in no ledger of ours.
       *
       * Deposits predate the payments table by months: they set a status on
       * the booking and nothing else. So the week's takings, the counter
       * total and the file somebody does a tax return from have never
       * included a single deposit — every one of them taken, banked, and
       * invisible to the only figures a business reads.
       *
       * Written here, once, behind the same claim that stops a retried
       * webhook confirming a booking twice — so a deposit cannot be recorded
       * twice either. Only where the session did not already carry a payment
       * of its own, which is what a link made by askForPayment does: that one
       * has been recorded since before the customer opened it.
       */
      if (!paymentId) {
        const { data: booking } = await db
          .from("bookings")
          .select("artist_id, contact_id, artists(studio_id)")
          .eq("id", bookingId)
          .maybeSingle();

        const studioId = (booking as { artists?: { studio_id?: string } | null } | null)
          ?.artists?.studio_id;

        if (studioId) {
          const { error: depositError } = await db.from("payments").insert({
            studio_id: studioId,
            artist_id: booking?.artist_id ?? null,
            contact_id: booking?.contact_id ?? null,
            booking_id: bookingId,
            kind: "deposit",
            gross_pence: session.amount_total ?? 0,
            status: "paid",
            method: "link",
            description: "Deposit",
            stripe_session_id: session.id,
            stripe_payment_intent_id:
              typeof session.payment_intent === "string" ? session.payment_intent : null,
            paid_at: new Date().toISOString(),
          });

          /*
           * Logged and carried on, deliberately, unlike the claim above.
           *
           * The booking is already confirmed by this point and the customer is
           * owed their confirmation email. Failing here would have Stripe
           * retry the whole event, and the claim would stop the second attempt
           * before it reached this line — so the row would never be written
           * and the confirmation might go twice. A missing line in a ledger is
           * worth less than either.
           */
          if (depositError) {
            console.error("[stripe] deposit not recorded", depositError.message);
          }
        }
      }

      if (conversationId) {
        await db
          .from("conversations")
          .update({ status: "booked" })
          .eq("id", conversationId);

        await db.from("messages").insert({
          conversation_id: conversationId,
          role: "system",
          content: `Deposit paid — ${((session.amount_total ?? 0) / 100).toLocaleString("en-GB", { style: "currency", currency: "GBP" })}.`,
        });
      }

      /*
       * The confirmation, with the appointment attached.
       *
       * Deliberately after the booking is already updated, and deliberately
       * unable to throw: an email that does not send must never be the reason
       * Stripe retries a payment that has already gone through.
       */
      await sendBookingConfirmation(db, bookingId);

      // The deposit landing is the moment the held slot becomes a booking, so
      // it is the moment the business hears about it — and the only one.
      await alertNewBooking(db, bookingId);
      break;
    }

    case "checkout.session.expired": {
      const session = event.data.object;
      const bookingId = session.metadata?.booking_id;
      if (!bookingId) break;

      // Put it back to unpaid so the hold sweep can release the slot.
      await db
        .from("bookings")
        .update({ deposit_status: "unpaid" })
        .eq("id", bookingId)
        .eq("deposit_status", "link_sent");
      break;
    }

    case "charge.refunded": {
      const charge = event.data.object;

      /*
       * The payment row, wherever the refund was actually done.
       *
       * There is no refund button in the product — a business does it in
       * Stripe, which is their account and their dashboard. So this is the
       * only way a refund ever reaches our own figures, and without it the
       * money came back out and the week's takings, the counter total and the
       * file somebody does their tax return from all still said it was paid.
       *
       * Matched on the payment intent rather than on metadata, because a
       * refund raised by hand in Stripe carries whatever metadata the original
       * charge had and nothing we can rely on. The intent is the one thing
       * both ends always agree about.
       */
      const intent =
        typeof charge.payment_intent === "string" ? charge.payment_intent : null;

      if (intent) {
        const { error } = await db
          .from("payments")
          .update({ status: "refunded", updated_at: new Date().toISOString() })
          .eq("stripe_payment_intent_id", intent)
          .neq("status", "refunded");

        // Worth failing on, so Stripe retries: a refund we could not record is
        // a figure that stays wrong, quietly, in somebody's accounts.
        if (error) {
          console.error("[stripe] could not record refund", error.message);
          return NextResponse.json({ error: "Could not record" }, { status: 500 });
        }
      }

      const bookingId = charge.metadata?.booking_id;
      if (!bookingId) break;

      await db
        .from("bookings")
        .update({ deposit_status: "refunded" })
        .eq("id", bookingId);
      break;
    }
  }

  return NextResponse.json({ received: true });
}
