import Link from "next/link";
import { requireStudio, getArtists } from "@/lib/studio";
import { createClient } from "@/lib/supabase/server";
import { verticalPack } from "@/lib/verticals";
import { SellForm } from "./SellForm";
import { AskForPayment } from "@/components/AskForPayment";

/**
 * The till.
 *
 * Reached from the + on the diary, because that is where somebody already goes
 * when something needs writing down — and a sale is the one thing that
 * happened in the shop today that the diary had no way of hearing about.
 */
export default async function SellPage() {
  const { studio, userId } = await requireStudio();
  const supabase = await createClient();

  /*
   * Products first, then anything else on the price list.
   *
   * A counter sale is nearly always a product, but not always — a shop sells a
   * gift voucher, and somebody paying for a service they had without an
   * appointment is a real thing that happens. So services are offered too,
   * below, rather than made impossible.
   */
  const { data: catalogue } = await supabase
    .from("services")
    .select("*")
    .eq("studio_id", studio.id)
    .eq("active", true)
    .order("kind")
    .order("sort_order");

  const products = (catalogue ?? []).map((s) => ({
    id: s.id as string,
    name: s.name as string,
    kind: (s.kind as "service" | "product") ?? "service",
    pricePence: (s.price_pence as number | null) ?? null,
  }));

  const people = (await getArtists(studio.id))
    .filter((a) => a.active)
    .map((a) => ({ id: a.id, name: a.name }));

  const me = (await getArtists(studio.id)).find((a) => a.user_id === userId)?.id ?? null;

  const words = {
    ...verticalPack(studio.vertical).vocabulary,
    ...(studio.vocabulary ?? {}),
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
      <Link href="/diary" className="hint inline-flex items-center gap-1.5 hover:text-foreground">
        &larr; The diary
      </Link>

      <h1 className="page-title mt-3">Sell something</h1>
      <p className="hint mt-1 max-w-prose">
        Anything that is not an appointment: a bottle off the shelf, a voucher, a walk-in
        paying cash. It goes in today&rsquo;s takings and on the client&rsquo;s record.
      </p>

      {products.length === 0 && (
        <p className="mt-5 rounded-lg bg-surface-2 px-3 py-2 text-sm text-muted">
          Nothing is on your price list yet, so there is nothing to tap. You can still type
          what was sold below &mdash; or add it to{" "}
          <Link href="/settings/pricing" className="underline">
            your prices
          </Link>{" "}
          so it is one tap next time.
        </p>
      )}

      <div className="mt-6">
        <SellForm
          products={products}
          people={people}
          me={me}
          words={{ business: words.business }}
        />
      </div>

      {/*
        * And the other way of being paid for it.
        *
        * The form above records money that has already changed hands. This is
        * for the half of a counter sale where it has not: somebody collecting
        * on Friday, or paying for their mother's voucher from two streets
        * away. Kept underneath rather than inside, because they are different
        * actions — one writes down what happened, the other asks for something
        * to happen.
        */}
      <div className="mt-8 border-t border-border pt-6">
        <div className="section-title">Or send a link to pay</div>
        <p className="hint mb-3 mt-1 max-w-prose">
          For something being collected later, or somebody paying who is not stood in
          front of you. It lands in the takings by itself once they pay.
        </p>
        <AskForPayment
          description={`${studio.name}`}
          connected={Boolean(studio.stripe_account_id)}
          artistId={me}
          label="Make a payment link"
        />
      </div>
    </div>
  );
}
