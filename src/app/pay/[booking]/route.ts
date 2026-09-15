import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createDepositCheckout, checkoutState } from "@/lib/payments/stripe";
import { whoTakes } from "@/lib/payments/whoTakes";
import { describeSlot } from "@/lib/booking";
import type { Studio } from "@/lib/types";
import { wordsFor, capital } from "@/lib/words";

export const runtime = "nodejs";

/**
 * A short, sendable payment link.
 *
 * Stripe's own checkout URLs run to several hundred characters, which is
 * unreadable in a chat window and looks like something you should not click.
 * This is /pay/<booking>, and it forwards.
 *
 * It also self-heals: if the Stripe session has expired since the link was
 * sent, a fresh one is created rather than the client hitting a dead page.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ booking: string }> },
) {
  const { booking: bookingId } = await params;
  const origin = request.nextUrl.origin;

  if (!/^[0-9a-f-]{36}$/i.test(bookingId)) {
    return NextResponse.redirect(`${origin}/pay/cancelled?reason=gone`);
  }

  const db = createAdminClient();

  type BookingRow = {
    id: string;
    starts_at: string;
    ends_at: string;
    type: "consultation" | "session";
    deposit_amount_pence: number;
    deposit_status: string;
    held_until: string | null;
    cancelled_at: string | null;
    stripe_payment_link_id: string | null;
    artists: {
      id: string;
      name: string;
      studio_id: string;
      stripe_account_id?: string | null;
      takes_deposits?: boolean | null;
    };
    enquiries: {
      conversation_id: string;
      conversations: { contacts: { email: string | null } | null } | null;
    } | null;
  };

  const { data: bookingRow } = await db
    .from("bookings")
    .select(
      "id, starts_at, ends_at, type, deposit_amount_pence, deposit_status, held_until, " +
        "cancelled_at, stripe_payment_link_id, artists!inner(*), " +
        "enquiries(conversation_id, conversations(contacts(email)))",
    )
    .eq("id", bookingId)
    .maybeSingle();

  const booking = bookingRow as unknown as BookingRow | null;

  if (!booking || booking.cancelled_at) {
    return NextResponse.redirect(`${origin}/pay/cancelled?booking=${bookingId}&reason=gone`);
  }

  if (booking.deposit_status === "paid") {
    return NextResponse.redirect(`${origin}/pay/done?booking=${bookingId}`);
  }

  // Refunded, or anything else that is not waiting for money, is not paid again.
  if (booking.deposit_status !== "unpaid" && booking.deposit_status !== "link_sent") {
    return NextResponse.redirect(`${origin}/pay/cancelled?booking=${bookingId}&reason=gone`);
  }

  /*
   * A hold that has run out is a slot that has gone.
   *
   * The sweep releases expired holds whenever somebody else looks at that
   * person's free times, so the slot may already be offered to somebody else.
   * Paying for it now would take money for an appointment that does not exist.
   */
  if (booking.held_until && Date.parse(booking.held_until) <= Date.now()) {
    return NextResponse.redirect(`${origin}/pay/cancelled?booking=${bookingId}&reason=expired`);
  }

  const artist = booking.artists;
  const { data: studioRow } = await db
    .from("studios")
    .select("*")
    .eq("id", artist.studio_id)
    .single();

  const studio = studioRow as Studio;

  /*
   * Whose account the deposit goes into.
   *
   * The business's, on a business paid as one; the person's own, where each
   * is paid separately — or the business's, only if the owner chose that.
   * The short link used to charge the business's account whatever the model,
   * so a chair renter's deposit landed with the owner.
   */
  const verdict = whoTakes(studio, artist, "deposit");
  const account = verdict.ok ? verdict.account : null;

  // The session already sent: reuse it if it is still open, and never make a
  // second one for a deposit that has already been paid.
  if (booking.stripe_payment_link_id) {
    const existing = await checkoutState(studio, booking.stripe_payment_link_id, account);
    if (existing.state === "paid") {
      return NextResponse.redirect(`${origin}/pay/done?booking=${bookingId}`);
    }
    if (existing.state === "open") return NextResponse.redirect(existing.url);
  }

  /*
   * A link is only a link if the money can reach the business.
   *
   * This route can be opened directly — it is a short URL sent in a message,
   * and it will still be in somebody's chat history long after the
   * conversation. Without a connected account the charge falls back to the
   * platform's, so a customer paying a salon's deposit would be paying us. The
   * booking itself is fine and stands; there is simply nothing to pay.
   *
   * Demonstrations are the deliberate exception, and only demonstrations: that
   * is the one case where charging the platform account in test mode is the
   * point rather than a mistake.
   */
  if (!account && studio.kind !== "demo") {
    // Nothing to wait for, so the slot is theirs rather than held and swept.
    await db.from("bookings").update({ held_until: null }).eq("id", booking.id).is("cancelled_at", null);
    return NextResponse.redirect(`${origin}/pay/not-needed?booking=${bookingId}`);
  }

  const enquiry = booking.enquiries;

  try {
    const checkout = await createDepositCheckout({
      studio,
      bookingId: booking.id,
      conversationId: enquiry?.conversation_id ?? "",
      amountPence: booking.deposit_amount_pence,
      description: `${booking.type === "consultation" ? "Consultation" : capital(wordsFor(studio).service)} with ${artist.name}, ${describeSlot(
        { starts_at: booking.starts_at, ends_at: booking.ends_at },
        studio.timezone,
      )}`,
      heldUntil: booking.held_until,
      origin,
      clientEmail: enquiry?.conversations?.contacts?.email,
      account,
    });

    /*
     * The hold lasts as long as the checkout does.
     *
     * Stripe will not let a checkout close in under half an hour, so opening
     * the link with ten minutes of the hold left gave them half an hour to pay
     * for a slot that was released after ten. The hold is stretched to match.
     */
    const checkoutEnds = new Date(Date.now() + 31 * 60_000).toISOString();
    const { data: updated } = await db
      .from("bookings")
      .update({
        stripe_payment_link_id: checkout.sessionId,
        deposit_status: "link_sent",
        ...(booking.held_until && booking.held_until < checkoutEnds ? { held_until: checkoutEnds } : {}),
      })
      .eq("id", booking.id)
      // Not over a payment the webhook recorded a moment ago, nor a cancellation.
      .in("deposit_status", ["unpaid", "link_sent"])
      .is("cancelled_at", null)
      .select("id");

    if (!updated?.length) {
      return NextResponse.redirect(`${origin}/pay/done?booking=${bookingId}`);
    }

    return NextResponse.redirect(checkout.url);
  } catch (error) {
    console.error("[pay]", error);
    return NextResponse.redirect(`${origin}/pay/cancelled?booking=${bookingId}&reason=error`);
  }
}
