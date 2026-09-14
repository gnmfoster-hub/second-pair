import { formatPence } from "@/lib/money";
import { savedWords } from "@/lib/savedAt";
import { SendReceipt } from "./SendReceipt";

export type Purchase = {
  id: string;
  pence: number;
  when: string | null;
  description: string | null;
  method: string | null;
  /** "paid" or "refunded". Refunds stay on the record rather than vanishing. */
  status: string;
  /**
   * Stripe's own id for the charge, where it went through Stripe at all.
   *
   * Null for cash and for a card machine, which are the business's own
   * arrangements and nothing to do with us — there is nowhere to send somebody
   * for those, and pretending otherwise would be worse than saying nothing.
   */
  intent: string | null;
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
/**
 * How it was paid, in words rather than in the value stored.
 *
 * "card" is what the column holds and "card machine" is what somebody calls
 * it; "phone" is a card tapped on a phone through Stripe, which is a different
 * thing from a card terminal even though both look like a card at the desk.
 */
function methodWords(method: string): string {
  if (method === "card") return "card machine";
  if (method === "phone") return "tapped on a phone";
  if (method === "link") return "paid by link";
  return method;
}

export function Bought({
  purchases,
  timezone,
  contactId,
  canEmail,
}: {
  purchases: Purchase[];
  timezone: string | null;
  contactId: string;
  /**
   * Whether there is an address to send a receipt to.
   *
   * Read here rather than discovered on pressing it: offering a button that
   * can only ever answer "there is no email address on this client" is worse
   * than not offering it, because somebody presses it once per payment before
   * believing it.
   */
  canEmail: boolean;
}) {
  if (purchases.length === 0) return null;

  /*
   * What they have actually paid, which is not what they have been charged.
   *
   * A refunded payment stays on the record above — it happened, and hiding it
   * would read as the product having lost a payment — but adding it to the
   * total would tell a salon somebody has spent two hundred pounds when half
   * of it went back.
   */
  const total = purchases
    .filter((p) => p.status !== "refunded")
    .reduce((sum, p) => sum + p.pence, 0);

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
            <div className="hint mt-0.5 flex flex-wrap items-baseline gap-x-2">
              <span>
                {savedWords(p.when, timezone) ?? "no date recorded"}
                {p.method && ` · ${methodWords(p.method)}`}
              </span>

              {p.status === "refunded" && <span className="text-warn">refunded</span>}

              {/*
                * Refunding, which happens in Stripe rather than here.
                *
                * The money is on the business's own Stripe account — they are
                * the merchant of record, and refunds, disputes and chargebacks
                * are theirs. A button here would either need their keys or
                * have to move money on their behalf, and neither is something
                * we should be doing to somebody's balance.
                *
                * So this is a link to the exact charge, which is the useful
                * half: the slow part of a refund is finding the payment among
                * three hundred, not pressing the button once you have.
                *
                * Only where there is a charge to open. Cash and a card machine
                * never went through Stripe, and there is nowhere to send
                * anybody for those.
                */}
              {p.intent && p.status !== "refunded" && (
                <a
                  href={`https://dashboard.stripe.com/payments/${p.intent}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent hover:underline"
                >
                  Refund in Stripe
                </a>
              )}

              {/*
                * Sending the receipt again, which is what somebody actually
                * wants from this screen. A receipt goes on its own when the
                * money lands; it can go to spam, or to an address they have
                * since changed, and "I never got it" had no answer here but
                * typing the payment out by hand in a message.
                */}
              {canEmail && p.status !== "refunded" && (
                <SendReceipt paymentId={p.id} contactId={contactId} />
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
