import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Where a payment that did not happen ends up.
 *
 * It said "your slot is held for a short while" to everybody — somebody who
 * pressed back on Stripe's page, but also a customer whose booking had been
 * cancelled, whose hold had run out, or whose link had failed at our end. Two
 * of those have no slot being held at all. And there was nowhere to go from
 * it. Now it says which of those happened, and links back to the business.
 */
export default async function PaymentCancelledPage({
  searchParams,
}: {
  searchParams: Promise<{ booking?: string; reason?: string }>;
}) {
  const { booking, reason } = await searchParams;

  let business: { name: string; slug: string } | null = null;
  if (booking && /^[0-9a-f-]{36}$/i.test(booking)) {
    const { data } = await createAdminClient()
      .from("bookings")
      .select("artists(studios(name, slug))")
      .eq("id", booking)
      .maybeSingle();
    business =
      (data?.artists as unknown as { studios: { name: string; slug: string } | null } | null)?.studios ??
      null;
  }

  const [heading, body] =
    reason === "expired"
      ? [
          "That hold has run out",
          "Nothing has been charged. The time was only held for a while, so it may have gone. Ask for it again and you will be offered what is free.",
        ]
      : reason === "gone"
        ? [
            "There is nothing to pay on that link",
            "Nothing has been charged. The booking it was for has been cancelled or is no longer waiting for a payment.",
          ]
        : reason === "error"
          ? [
              "The payment page would not open",
              "Nothing has been charged. Something went wrong at our end. Try the link again in a minute, or get in touch with the business.",
            ]
          : [
              "Payment cancelled",
              "Nothing has been charged. Your slot is held for a short while, so go back and ask for the link again if you still want it.",
            ];

  return (
    <div className="grid min-h-screen place-items-center px-6 text-center">
      <div className="max-w-sm">
        <h1 className="text-lg font-semibold tracking-tight">{heading}</h1>
        <p className="hint mt-2">{body}</p>
        {business?.slug && (
          <Link href={`/widget/${business.slug}`} className="btn mt-6 inline-flex border border-border">
            Back to {business.name}
          </Link>
        )}
      </div>
    </div>
  );
}
