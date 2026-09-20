import Link from "next/link";
import { requireStudio, getArtists } from "@/lib/studio";
import { payableFor } from "@/lib/payments/whoTakes";
import { createClient } from "@/lib/supabase/server";
import { wordsFor } from "@/lib/words";
import { SellForm } from "./SellForm";

/**
 * The till.
 *
 * Reached from the + on the diary, because that is where somebody already goes
 * when something needs writing down — and a sale is the one thing that
 * happened in the shop today that the diary had no way of hearing about.
 */
export default async function SellPage({
  searchParams,
}: {
  /** `client` arrives from closing an appointment off. See below. */
  searchParams: Promise<{ client?: string }>;
}) {
  const { client } = await searchParams;
  const { studio, userId } = await requireStudio();
  const supabase = await createClient();

  /*
   * Who it is for, when this came from an appointment.
   *
   * A bottle is sold at the end of somebody's appointment far more often than
   * it is sold to a passer-by, and that meant closing the booking, walking to
   * the till, and typing a name the product had on screen a second earlier.
   * Closing an appointment off now offers this with them already in it.
   *
   * Checked against this business rather than trusted, because it arrives in
   * the address bar.
   */
  const { data: forClient } = client
    ? await supabase
        .from("contacts")
        .select("id, name")
        .eq("id", client)
        .eq("studio_id", studio.id)
        .maybeSingle()
    : { data: null };

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
    stock: (s.stock as number | null) ?? null,
  }));

  const people = (await getArtists(studio.id))
    .filter((a) => a.active)
    .map((a) => ({ id: a.id, name: a.name }));

  const me = (await getArtists(studio.id)).find((a) => a.user_id === userId)?.id ?? null;

  const words = wordsFor(studio);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
      <Link href="/diary" className="hint inline-flex items-center gap-1.5 hover:text-foreground">
        &larr; The diary
      </Link>

      <h1 className="page-title mt-3">Sell something</h1>
      <p className="hint mt-1 max-w-prose">
        Anything that is not {words.service === "appointment" ? "an appointment" : `a ${words.service}`}: {words.exampleProduct.toLowerCase()}, a voucher, a walk-in
        paying cash. It goes in today&rsquo;s takings and on the client&rsquo;s record.
      </p>

      {products.length === 0 && (
        <p className="mt-5 rounded-lg bg-surface-2 px-3 py-2 text-sm text-muted">
          Nothing is on your price list yet, so there is nothing to tap. You can still type
          what was sold below, or add it to{" "}
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
          words={{ business: words.business, product: words.exampleProduct }}
          forClient={forClient ? { id: forClient.id, name: forClient.name } : null}
          /*
           * Whether a payment link is possible at all. The till offers one for
           * whatever is in the basket, so it lives inside the form rather than
           * underneath it — a generic "make a link" box below a basket you had
           * just filled in was asking somebody to type the same total twice.
           */
          connected={payableFor(studio, await getArtists(studio.id)).length > 0}
        />
      </div>
    </div>
  );
}
