import { notifyStudio } from "@/lib/notify";
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
    console.error("[stripe] no webhook secret is set, refusing to trust the event");
    return NextResponse.json({ error: "Webhooks not configured" }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Unsigned" }, { status: 400 });

  const body = await request.text();

  let event: Stripe.Event | null = null;
  let eventMode: StripeMode = "live";
  let lastError = "";

  for (const { mode, secret } of secrets) {
    try {
      event = stripe(mode).webhooks.constructEvent(body, signature, secret);
      eventMode = mode;
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
        if (tookIt?.length) {
          /*
           * What Stripe kept, and so what the business actually takes home.
           *
           * The takings export has had a fee column and a take-home column
           * since it was written, and nothing ever filled either — every card
           * payment went out with the fee blank, which is the one figure an
           * accountant cannot work out from ours. It is on the charge's
           * balance transaction, on the business's own account.
           *
           * Best effort. A fee that cannot be read yet is not a reason to
           * refuse the payment and have Stripe retry it.
           */
          if (typeof session.payment_intent === "string" && event.account) {
            try {
              const intent = await stripe(eventMode).paymentIntents.retrieve(
                session.payment_intent,
                { expand: ["latest_charge.balance_transaction"] },
                { stripeAccount: event.account },
              );
              const charge = intent.latest_charge as Stripe.Charge | null;
              const txn = charge?.balance_transaction as Stripe.BalanceTransaction | null;
              if (txn && typeof txn === "object") {
                await db
                  .from("payments")
                  .update({ fee_pence: txn.fee, net_pence: txn.net })
                  .eq("id", paymentId);
              }
            } catch (e) {
              console.error("[stripe] could not read the fee", (e as Error).message);
            }
          }

          await sendPaymentReceipt(db, paymentId);
        }
      }

      if (!bookingId) break;

      /*
       * Only a deposit says anything about the booking.
       *
       * A balance paid by link after the appointment carries the booking's id
       * too, so it can be found from the client's record — and it fell through
       * to here, where it marked the deposit paid, sent the customer a second
       * "you're booked" email with a calendar invite, and told the owner about
       * a new booking that was months old. The payment row above is the whole
       * of what a balance means.
       */
      const kind = session.metadata?.kind;
      if (paymentId && kind !== "deposit") break;

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
        // A booking that was cancelled while they were paying stays cancelled.
        .is("cancelled_at", null)
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

      if (!claimed?.length) {
        /*
         * Either an earlier delivery already did all this, or they paid for a
         * slot that had gone — the hold ran out or it was cancelled while the
         * checkout was open. The second is money taken for nothing, and the
         * owner is the only person who can refund it or book them back in.
         */
        const { data: gone } = await db
          .from("bookings")
          .select("cancelled_at, artists(studio_id)")
          .eq("id", bookingId)
          .maybeSingle();
        const goneStudio = (gone as { artists?: { studio_id?: string } | null } | null)?.artists
          ?.studio_id;
        if (gone?.cancelled_at && goneStudio) {
          await notifyStudio(db, goneStudio, {
            title: "Paid for a slot that had gone",
            body:
              "A customer paid a deposit after their held slot was released. Book them back in or refund it in Stripe.",
            url: conversationId ? `/conversations/${conversationId}` : "/diary",
            tag: `paid-cancelled-${bookingId}`,
          });
          if (conversationId) {
            await db.from("messages").insert({
              conversation_id: conversationId,
              role: "system",
              content:
                "They paid the deposit after the held slot had been released. Book them back in, or refund it in Stripe.",
            });
            await db.from("conversations").update({ status: "needs_human" }).eq("id", conversationId);
          }
        }
        break;
      }

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
        /*
         * Logged, not thrown, and not silent either.
         *
         * Stripe retries a webhook that fails, and the money has already been
         * taken — throwing here would have it delivered again and the deposit
         * recorded twice. But a conversation left unbooked after a customer
         * has paid is the one state nobody will notice: the payment is in
         * Stripe, the thread still says "deposit sent", and the owner chases
         * somebody who has already paid them.
         */
        const { error: notBooked } = await db
          .from("conversations")
          .update({ status: "booked" })
          .eq("id", conversationId);

        if (notBooked) {
          console.error("[stripe] paid but the conversation is still not booked", notBooked.message);
        }

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
      // A deposit asked for later, on a booking that already stood, confirms
      // nothing new — the customer already has their confirmation.
      if (!paymentId) {
        await sendBookingConfirmation(db, bookingId);

        // The deposit landing is the moment the held slot becomes a booking, so
        // it is the moment the business hears about it — and the only one.
        await alertNewBooking(db, bookingId);
      }
      break;
    }

    case "checkout.session.expired": {
      const session = event.data.object;

      /*
       * The link nobody paid.
       *
       * Every payment link this product makes expires within a day — a link
       * that never stops working is one that turns up in a text message
       * eighteen months later and charges somebody for an appointment they
       * have long since had. When one does expire, the row it was made
       * alongside is still sitting there marked pending.
       *
       * This case read booking_id and stopped, because when it was written a
       * link was always a deposit on a booking and there was no payments
       * table. So every balance asked for and not paid left a row saying money
       * was on its way, for ever, and the only thing keeping that harmless is
       * that no screen reads pending yet. The first one that does — a list of
       * what is outstanding, which is an obvious thing to want — would open
       * full of ghosts.
       *
       * Marked failed rather than deleted. "I sent her a link and she never
       * paid" is worth being able to answer, and a row that vanishes cannot
       * answer it.
       */
      const expiredPayment = session.metadata?.payment_id;
      if (expiredPayment) {
        await db
          .from("payments")
          .update({ status: "failed", updated_at: new Date().toISOString() })
          .eq("id", expiredPayment)
          .eq("status", "pending");
      }

      const bookingId = session.metadata?.booking_id;
      if (!bookingId) break;
      // A balance link going stale says nothing about the booking's deposit.
      if (expiredPayment && session.metadata?.kind !== "deposit") break;

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

      /*
       * Only a refund of the whole thing is a refund.
       *
       * Stripe sends this for a partial refund too, and it marked the whole
       * payment refunded — £10 back on a £100 colour took £100 off the week.
       * A partial one is left as paid and logged; the business can see the
       * detail in Stripe, and overstating by £10 is the smaller wrong.
       */
      if (charge.amount_refunded < charge.amount) {
        console.log("[stripe] partial refund left as paid", intent, charge.amount_refunded, charge.amount);
        break;
      }

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
