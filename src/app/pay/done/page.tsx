import { createAdminClient } from "@/lib/supabase/admin";
import { formatPence } from "@/lib/money";

// Reached after Stripe checkout. Deliberately reports what the database says
// rather than assuming payment succeeded — this URL is guessable, and only the
// webhook is allowed to confirm money.
export default async function PaymentDonePage({
  searchParams,
}: {
  searchParams: Promise<{ booking?: string }>;
}) {
  const { booking: bookingId } = await searchParams;

  let paid = false;
  let amount = 0;

  if (bookingId) {
    const db = createAdminClient();
    const { data } = await db
      .from("bookings")
      .select("deposit_status, deposit_amount_pence")
      .eq("id", bookingId)
      .maybeSingle();
    paid = data?.deposit_status === "paid";
    amount = data?.deposit_amount_pence ?? 0;
  }

  return (
    <div className="grid min-h-screen place-items-center px-6 text-center">
      <div className="max-w-sm">
        <div className="text-3xl">{paid ? "✓" : "⏳"}</div>
        <h1 className="mt-4 text-lg font-semibold tracking-tight">
          {paid ? "Deposit paid" : "Payment received"}
        </h1>
        <p className="hint mt-2">
          {paid
            ? `${formatPence(amount)} received. Your appointment is confirmed — you can close this window.`
            : "Just confirming it with our payment provider. This can take a few seconds; your appointment is held in the meantime."}
        </p>
      </div>
    </div>
  );
}
