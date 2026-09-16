import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Nothing to pay" };
export const dynamic = "force-dynamic";

/**
 * Where a deposit link lands when the business cannot take payments.
 *
 * Somebody has clicked a link expecting to pay and there is nothing to pay
 * into. The important thing is that their appointment is not in danger — the
 * booking stands, and the worst outcome here would be somebody assuming it
 * fell through because the payment did.
 *
 * It used to carry our logo and tell them to "reply to the conversation you
 * had", with no name and nothing to click — the only page in the pay family
 * that never looked the booking up. A customer who tapped their salon's link
 * met a company they have never heard of and a full stop. Its two neighbours,
 * /pay/done and /pay/cancelled, both name the business and offer a way back;
 * this one was simply missed.
 */
export default async function NotNeededPage({
  searchParams,
}: {
  searchParams: Promise<{ booking?: string }>;
}) {
  const { booking } = await searchParams;

  let business: { name: string; slug: string } | null = null;
  if (booking && /^[0-9a-f-]{36}$/i.test(booking)) {
    const { data } = await createAdminClient()
      .from("bookings")
      .select("artists(studios(name, slug))")
      .eq("id", booking)
      .maybeSingle();
    business =
      (data?.artists as unknown as { studios: { name: string; slug: string } | null } | null)
        ?.studios ?? null;
  }

  return (
    <div className="grid min-h-screen place-items-center px-6 text-center">
      <div className="max-w-sm">
        <h1 className="text-lg font-semibold tracking-tight">You are booked in</h1>
        <p className="hint mt-2">
          There is no deposit to pay after all &mdash; your appointment is confirmed exactly as it
          is, and nothing else is needed from you.
        </p>
        <p className="hint mt-3">
          {business
            ? `If you would rather change or cancel it, message ${business.name} and somebody will sort it out.`
            : "If you would rather change or cancel it, reply to the conversation you had and somebody will sort it out."}
        </p>
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
