import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createDepositCheckout, retrieveOpenCheckout } from "@/lib/payments/stripe";
import { describeSlot } from "@/lib/booking";
import type { Studio } from "@/lib/types";

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
    return NextResponse.redirect(`${origin}/pay/cancelled`);
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
    artists: { name: string; studio_id: string };
    enquiries: {
      conversation_id: string;
      conversations: { contacts: { email: string | null } | null } | null;
    } | null;
  };

  const { data: bookingRow } = await db
    .from("bookings")
    .select(
      "id, starts_at, ends_at, type, deposit_amount_pence, deposit_status, held_until, " +
        "cancelled_at, stripe_payment_link_id, artists!inner(name, studio_id), " +
        "enquiries(conversation_id, conversations(contacts(email)))",
    )
    .eq("id", bookingId)
    .maybeSingle();

  const booking = bookingRow as unknown as BookingRow | null;

  if (!booking || booking.cancelled_at) {
    return NextResponse.redirect(`${origin}/pay/cancelled`);
  }

  if (booking.deposit_status === "paid") {
    return NextResponse.redirect(`${origin}/pay/done?booking=${bookingId}`);
  }

  const artist = booking.artists;
  const { data: studioRow } = await db
    .from("studios")
    .select("*")
    .eq("id", artist.studio_id)
    .single();

  const studio = studioRow as Studio;

  // Reuse the session that was already sent, if it is still payable.
  if (booking.stripe_payment_link_id) {
    const existing = await retrieveOpenCheckout(studio, booking.stripe_payment_link_id);
    if (existing) return NextResponse.redirect(existing);
  }

  const enquiry = booking.enquiries;

  try {
    const checkout = await createDepositCheckout({
      studio,
      bookingId: booking.id,
      conversationId: enquiry?.conversation_id ?? "",
      amountPence: booking.deposit_amount_pence,
      description: `${booking.type === "consultation" ? "Consultation" : "Session"} with ${artist.name}, ${describeSlot(
        { starts_at: booking.starts_at, ends_at: booking.ends_at },
        studio.timezone,
      )}`,
      heldUntil: booking.held_until,
      origin,
      clientEmail: enquiry?.conversations?.contacts?.email,
    });

    await db
      .from("bookings")
      .update({ stripe_payment_link_id: checkout.sessionId, deposit_status: "link_sent" })
      .eq("id", booking.id);

    return NextResponse.redirect(checkout.url);
  } catch (error) {
    console.error("[pay]", error);
    return NextResponse.redirect(`${origin}/pay/cancelled`);
  }
}
