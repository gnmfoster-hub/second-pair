import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/payments/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendBookingConfirmation } from "@/lib/messaging/confirmation";
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
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[stripe] STRIPE_WEBHOOK_SECRET is not set — refusing to trust the event");
    return NextResponse.json({ error: "Webhooks not configured" }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Unsigned" }, { status: 400 });

  const body = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(body, signature, secret);
  } catch (error) {
    console.error("[stripe] bad signature", (error as Error).message);
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
        const { error: payError } = await db
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
          .neq("status", "paid");

        /*
         * Worth failing on, for the same reason as the booking below: Stripe
         * retrying a payment we could not record is exactly what retries are
         * for, and answering 200 would lose it silently.
         */
        if (payError) {
          console.error("[stripe] could not record payment", payError.message);
          return NextResponse.json({ error: "Could not record" }, { status: 500 });
        }
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
