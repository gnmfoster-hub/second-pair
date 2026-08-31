import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/payments/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendBookingConfirmation } from "@/lib/messaging/confirmation";

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
      if (!bookingId) break;

      // payment_status guards against a session completing without funds, which
      // is possible with delayed payment methods.
      if (session.payment_status !== "paid") break;

      await db
        .from("bookings")
        .update({
          deposit_status: "paid",
          stripe_session_id: session.id,
          // The hold becomes a real booking, so it stops being swept.
          held_until: null,
        })
        .eq("id", bookingId);

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
