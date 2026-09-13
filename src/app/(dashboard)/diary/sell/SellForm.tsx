"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { ClientPicker } from "../ClientPicker";
import { recordSale, type SellState } from "../sellActions";
import { METHODS, lineTotal } from "@/lib/sales";
import { formatPence } from "@/lib/money";

type Product = {
  id: string;
  name: string;
  kind: "service" | "product";
  pricePence: number | null;
  /** How many are left, where the shop counts them. Null is not counting. */
  stock: number | null;
};

type Line = {
  /** Stable across re-renders so React does not reuse a row's typed price. */
  key: number;
  serviceId: string | null;
  name: string;
  quantity: number;
  /** What somebody typed, in pounds. Kept as text so "12." is not "12". */
  price: string;
};

let nextKey = 1;
const blank = (): Line => ({ key: nextKey++, serviceId: null, name: "", quantity: 1, price: "" });

/**
 * Selling something that is not an appointment.
 *
 * A shop sells a bottle of shampoo, a gift voucher, a tub of wax. None of it
 * goes in the diary and all of it goes in the takings — and until now the
 * product could describe every one of those on its price list and had nowhere
 * to sell one.
 *
 * Built as a till rather than as a form: tap what they are having, it adds a
 * line at the price the shop already set, and the total is always on screen.
 * The price stays editable on the line, because a shop discounts, and a till
 * that cannot take £8 for a £10 bottle is a till somebody works around with a
 * paper pad — and then the quarter's figures are wrong.
 */
export function SellForm({
  products,
  people,
  me,
  words,
}: {
  products: Product[];
  people: { id: string; name: string }[];
  /** Whoever is signed in, where they are one of the people. */
  me: string | null;
  words: { business: string };
}) {
  const [state, action] = useActionState<SellState, FormData>(recordSale, {});
  const [lines, setLines] = useState<Line[]>([blank()]);

  /*
   * Whether the receipt has been cleared away.
   *
   * useActionState has no reset, and the honest alternative — reloading the
   * page to start a second sale — throws away the shelf and the scroll
   * position between two bottles sold thirty seconds apart. So the last result
   * is tracked instead, and a new one un-dismisses itself. Adjusted during
   * render rather than in an effect, which is how React itself says to derive
   * state from a prop.
   */
  const [seen, setSeen] = useState(state);
  const [dismissed, setDismissed] = useState(false);
  if (seen !== state) {
    setSeen(state);
    setDismissed(false);
  }

  const add = (p: Product) =>
    setLines((all) => {
      /*
       * A second bottle of the same thing is a quantity, not a second line.
       * Anybody who has stood at a till expects the second tap to say 2.
       */
      const already = all.findIndex((l) => l.serviceId === p.id);
      if (already >= 0) {
        const copy = [...all];
        copy[already] = { ...copy[already], quantity: copy[already].quantity + 1 };
        return copy;
      }

      const line: Line = {
        key: nextKey++,
        serviceId: p.id,
        name: p.name,
        quantity: 1,
        price: p.pricePence == null ? "" : (p.pricePence / 100).toFixed(2),
      };

      // Fill the empty starting row rather than leaving it above the sale.
      const empty = all.findIndex((l) => !l.name && !l.price);
      if (empty >= 0) {
        const copy = [...all];
        copy[empty] = line;
        return copy;
      }
      return [...all, line];
    });

  const set = (key: number, patch: Partial<Line>) =>
    setLines((all) => all.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const drop = (key: number) =>
    setLines((all) => (all.length === 1 ? [blank()] : all.filter((l) => l.key !== key)));

  /*
   * The running total, worked out the same way the server will work it out.
   * A price mid-typing is simply not counted yet rather than counted as zero,
   * which would make the total jump about under somebody's hands.
   */
  const total = lines.reduce((sum, l) => {
    const pounds = Number(l.price.replace(/[£,\s]/g, ""));
    if (!Number.isFinite(pounds) || !l.name) return sum;
    return sum + lineTotal({ quantity: l.quantity, unitPence: Math.round(pounds * 100) });
  }, 0);

  if (state.ok && !state.error && !dismissed) {
    return (
      <div className="card p-6 text-center">
        <div className="text-2xl font-medium tabular-nums">
          {formatPence(state.total ?? 0)} taken
        </div>
        <p className="hint mt-2">
          It is in today&rsquo;s takings, and on the client&rsquo;s record if you named one.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => {
              setLines([blank()]);
              setDismissed(true);
            }}
            className="btn bg-accent text-on-accent"
          >
            Sell something else
          </button>
          <Link href="/diary" className="btn-ghost">
            Back to the diary
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-5">
      {/* ------------------------------------------------------ the shelf */}
      {products.length > 0 && (
        <div className="card p-5">
          <div className="section-title">On the shelf</div>
          <p className="hint mt-1">Tap to add. Tap again for two.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {products.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => add(p)}
                className="rounded-xl border border-border bg-surface-2/40 px-3 py-2 text-left transition-colors hover:border-accent/40"
              >
                <div className="text-sm font-medium">{p.name}</div>
                <div className="hint tabular-nums">
                  {p.pricePence == null ? "no price set" : formatPence(p.pricePence)}
                  {/*
                    * What is left, where the shop counts them.
                    *
                    * Null is not counting and says nothing, which is most
                    * businesses. Nought says so plainly rather than hiding the
                    * button: somebody selling the last one they thought they
                    * had is a conversation with a customer, and finding out at
                    * the till beats finding out at the shelf.
                    */}
                  {p.stock != null && (
                    <span className={p.stock === 0 ? " text-warn" : ""}>
                      {" · "}
                      {p.stock === 0 ? "none left" : `${p.stock} left`}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------ the sale */}
      <div className="card p-5">
        <div className="section-title">This sale</div>

        <div className="mt-3 space-y-2">
          {lines.map((line, i) => (
            <div key={line.key} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name={`service_${i}`} value={line.serviceId ?? ""} />

              <label className="min-w-40 flex-1">
                <span className="label">What</span>
                <input
                  name={`name_${i}`}
                  value={line.name}
                  onChange={(e) => set(line.key, { name: e.target.value, serviceId: null })}
                  placeholder="Shampoo, gift voucher…"
                  className="input"
                />
              </label>

              <label className="w-20">
                <span className="label">How many</span>
                <input
                  name={`qty_${i}`}
                  value={line.quantity}
                  onChange={(e) =>
                    set(line.key, { quantity: Math.max(1, Number(e.target.value) || 1) })
                  }
                  inputMode="numeric"
                  className="input tabular-nums"
                />
              </label>

              <label className="w-28">
                <span className="label">Each</span>
                <input
                  name={`price_${i}`}
                  value={line.price}
                  onChange={(e) => set(line.key, { price: e.target.value })}
                  placeholder="0.00"
                  inputMode="decimal"
                  className="input tabular-nums"
                />
              </label>

              <button
                type="button"
                onClick={() => drop(line.key)}
                className="btn-ghost mb-0.5"
                aria-label={`Take ${line.name || "this line"} off the sale`}
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setLines((all) => [...all, blank()])}
          className="btn-ghost mt-3"
        >
          Another line
        </button>

        <div className="mt-4 flex items-baseline justify-between border-t border-border pt-3">
          <span className="label">Total</span>
          <span className="text-xl font-medium tabular-nums">{formatPence(total)}</span>
        </div>
      </div>

      {/* -------------------------------------------- who, and how paid */}
      <div className="card space-y-4 p-5">
        <div>
          <span className="label">Who is it for</span>
          <p className="hint mb-1.5">
            Leave it empty for somebody passing. Naming them puts it on their record, so
            &ldquo;what does she use&rdquo; has an answer next time.
          </p>
          <ClientPicker placeholder="Search a client, or type a name" />
        </div>

        {people.length > 1 && (
          <label className="block">
            <span className="label">Whose sale is it</span>
            <select name="artist_id" defaultValue={me ?? ""} className="input max-w-xs">
              <option value="">The {words.business}&rsquo;s own</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <span className="hint">
              It counts towards their takings, and appears on their own figures at the end
              of the quarter.
            </span>
          </label>
        )}

        <fieldset>
          <legend className="label">How was it paid</legend>
          <div className="mt-1 flex flex-wrap gap-3">
            {METHODS.map((m, i) => (
              <label key={m.value} className="flex items-center gap-2 text-sm">
                <input type="radio" name="method" value={m.value} defaultChecked={i === 0} />
                {m.label}
              </label>
            ))}
          </div>
          <p className="hint mt-1.5">
            Written down, not taken. The money has already changed hands &mdash; this is
            what makes the quarter add up to what actually went through the business.
          </p>
        </fieldset>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn bg-accent text-on-accent">
          Record {formatPence(total)}
        </button>
        <Link href="/diary" className="btn-ghost">
          Cancel
        </Link>
        {state.error && <p className="text-sm text-bad">{state.error}</p>}
      </div>
    </form>
  );
}
