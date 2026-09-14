import { formatPence } from "@/lib/money";
import { savedWords } from "@/lib/savedAt";

export type Purchase = {
  id: string;
  pence: number;
  when: string | null;
  description: string | null;
  method: string | null;
  items: { name: string; quantity: number; unitPence: number }[];
};

/**
 * What this client has bought, as opposed to what they have had done.
 *
 * The question a salon asks out loud and could never answer: "what does she
 * use?" Somebody comes in for a colour, likes the conditioner, buys a bottle,
 * and six weeks later nobody can remember which one — so it is not offered
 * again, which is a sale lost to a filing problem rather than to a decision.
 *
 * Deliberately not merged into the appointment history. A purchase has no time
 * and no length, and putting it on the same timeline as bookings would mean
 * inventing both.
 */
export function Bought({
  purchases,
  timezone,
}: {
  purchases: Purchase[];
  timezone: string | null;
}) {
  if (purchases.length === 0) return null;

  const total = purchases.reduce((sum, p) => sum + p.pence, 0);

  return (
    <section className="card p-5">
      {/*
        * "Paid" rather than "Bought", now that deposits land here too.
        *
        * A deposit is not something somebody bought, and the lines underneath
        * still answer the question this section exists for — what does she
        * use — because a deposit has no lines and a sale does.
        */}
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="section-title text-sm">Paid</h2>
        <span className="hint tabular-nums">{formatPence(total)} in all</span>
      </div>

      <ul className="mt-3 space-y-3">
        {purchases.map((p) => (
          <li key={p.id} className="border-b border-border pb-3 last:border-0 last:pb-0">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm">
                {/*
                  * The lines where there are lines, and the description where
                  * there are not — a payment recorded before line items
                  * existed, or a deposit, still says what it was for.
                  */}
                {p.items.length > 0
                  ? p.items
                      .map((i) => (i.quantity > 1 ? `${i.quantity} × ${i.name}` : i.name))
                      .join(", ")
                  : (p.description ?? "Something")}
              </span>
              <span className="tabular-nums">{formatPence(p.pence)}</span>
            </div>
            <div className="hint mt-0.5">
              {savedWords(p.when, timezone) ?? "no date recorded"}
              {p.method && ` · ${p.method === "card" ? "card machine" : p.method}`}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
