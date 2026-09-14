"use client";

import { useActionState, useState } from "react";
import { recordSale, type SellState } from "./sellActions";
import { METHODS, lineTotal } from "@/lib/sales";
import { formatPence } from "@/lib/money";

export type ShelfItem = {
  id: string;
  name: string;
  pricePence: number | null;
  /** How many are left, where the shop counts them. Null is not counting. */
  stock: number | null;
  /**
   * Whose it is. Null is the shop's, and on everybody's shelf.
   *
   * A nail technician who stocks her own two products has them on the price
   * list already, against her name — and a shelf that only ever showed the
   * shop's would be the same gap as every other one in this product: the thing
   * exists, and nothing anywhere will sell it.
   */
  ownerId: string | null;
};

type Line = { key: number; serviceId: string; name: string; quantity: number; pricePence: number };

let nextKey = 1;

/**
 * A bottle of something, sold at the end of the appointment.
 *
 * This is where it actually happens. The client is stood up, the colour is
 * done, she asks what the silver shampoo was — and the only way to record that
 * was to leave the appointment, open the till, search for her by name and type
 * it in again. Three screens and a search for things the diary already knows:
 * who she is, whose client she is, what she came in for. So it gets done on a
 * paper pad or not at all, and the quarter is short by exactly the amount that
 * was easiest to take.
 *
 * Deliberately only products. The till sells services too, because somebody
 * can walk in and buy a blow-dry without an appointment — but the work on this
 * appointment is the appointment, and offering it here is offering to charge
 * for the same cut twice.
 *
 * Deliberately not a second till either. No client picker, no person picker,
 * no free-typed lines: everything a till has to ask, this screen already knows.
 * What is left is the shelf and how it was paid.
 */
export function SellOnBooking({
  bookingId,
  contactId,
  artistId,
  shelf,
  alreadyPence,
}: {
  bookingId: string;
  /** Null on an appointment nobody is attached to. The sale still counts. */
  contactId: string | null;
  artistId: string;
  shelf: ShelfItem[];
  /**
   * What has already been sold at this appointment.
   *
   * Shown rather than assumed away. Somebody reopening an appointment they
   * sold a bottle at half an hour ago would otherwise have no sign of it and
   * would sell it again — a real customer charged twice, and the sort of
   * mistake only found when they say so.
   */
  alreadyPence: number | null;
}) {
  const [state, action] = useActionState<SellState, FormData>(recordSale, {});
  const [lines, setLines] = useState<Line[]>([]);
  const [open, setOpen] = useState(false);

  const total = lines.reduce(
    (sum, l) => sum + lineTotal({ quantity: l.quantity, unitPence: l.pricePence }),
    0,
  );

  const add = (item: ShelfItem) =>
    setLines((all) => {
      // A second tap on the same thing is a quantity, which is what anybody
      // who has stood at a till expects it to be.
      const at = all.findIndex((l) => l.serviceId === item.id);
      if (at >= 0) {
        const copy = [...all];
        copy[at] = { ...copy[at], quantity: copy[at].quantity + 1 };
        return copy;
      }
      return [
        ...all,
        {
          key: nextKey++,
          serviceId: item.id,
          name: item.name,
          quantity: 1,
          pricePence: item.pricePence ?? 0,
        },
      ];
    });

  const drop = (key: number) => setLines((all) => all.filter((l) => l.key !== key));

  /*
   * Sold, and said so where it happened.
   *
   * It does not clear itself afterwards. A second sale on the same appointment
   * is rare, and a receipt that vanishes the moment it appears is how somebody
   * ends up unsure whether the first one went through.
   */
  if (state.ok) {
    return (
      <div className="mt-3 border-t border-border pt-3">
        <p className="text-sm text-ok">
          {formatPence(state.total ?? 0)} added to this appointment.
        </p>
        <p className="hint mt-1">
          It is in today&rsquo;s takings and on their record, and a receipt has gone to them
          if they have an email address on file.
        </p>
        {/*
          * Recorded, and something about it did not save — the breakdown of
          * what was in it, most likely. The money is the part that had to be
          * right and it is; saying nothing would be claiming more than
          * happened.
          */}
        {state.error && <p className="hint mt-1 text-warn">{state.error}</p>}
      </div>
    );
  }

  return (
    <div className="mt-3 border-t border-border pt-3">
      {alreadyPence != null && alreadyPence > 0 && (
        <p className="hint mb-2">
          {formatPence(alreadyPence)} of things already sold at this appointment.
        </p>
      )}

      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="btn-ghost py-1.5 text-sm">
          Sold them something
        </button>
      ) : (
        <form action={action} className="space-y-3">
          <input type="hidden" name="booking_id" value={bookingId} />
          <input type="hidden" name="artist_id" value={artistId} />
          {contactId && <input type="hidden" name="contact_id" value={contactId} />}

          <div>
            <span className="label">On the shelf</span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {shelf.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => add(item)}
                  disabled={item.stock === 0}
                  className="rounded-lg border border-border bg-surface-2/40 px-2.5 py-1.5 text-left text-sm transition-colors hover:border-accent/40 disabled:opacity-40"
                >
                  {item.name}
                  <span className="hint ml-1.5 tabular-nums">
                    {item.pricePence == null ? "no price" : formatPence(item.pricePence)}
                  </span>
                  {/* Nought says so rather than hiding the button: finding out
                      at the till beats finding out at the shelf. */}
                  {item.stock === 0 && <span className="hint ml-1 text-warn">none left</span>}
                </button>
              ))}
            </div>
          </div>

          {lines.length > 0 && (
            <ul className="space-y-1.5">
              {lines.map((line, i) => (
                <li key={line.key} className="flex items-center gap-2 text-sm">
                  {/*
                    * The same indexed field names the till uses, so one action
                    * serves both and there is no second way for a sale to be
                    * read out of a form.
                    */}
                  <input type="hidden" name={`service_${i}`} value={line.serviceId} />
                  <input type="hidden" name={`name_${i}`} value={line.name} />
                  <input type="hidden" name={`qty_${i}`} value={line.quantity} />
                  <input
                    type="hidden"
                    name={`price_${i}`}
                    value={(line.pricePence / 100).toFixed(2)}
                  />

                  <span className="min-w-0 flex-1 truncate">
                    {line.quantity > 1 ? `${line.quantity} × ${line.name}` : line.name}
                  </span>
                  <span className="tabular-nums">
                    {formatPence(line.quantity * line.pricePence)}
                  </span>
                  <button
                    type="button"
                    onClick={() => drop(line.key)}
                    className="hint hover:text-foreground"
                    aria-label={`Take ${line.name} off`}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
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
          </fieldset>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={total === 0}
              className="btn bg-accent py-1.5 text-sm text-on-accent disabled:opacity-50"
            >
              Record {formatPence(total)}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="btn-ghost py-1.5 text-sm"
            >
              Not now
            </button>
            {state.error && <p className="text-sm text-bad">{state.error}</p>}
          </div>
        </form>
      )}
    </div>
  );
}
