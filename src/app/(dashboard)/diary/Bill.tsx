"use client";

import { useActionState, useState } from "react";
import { takePayment, type BillState } from "./billActions";
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
 * What they owe, finished in one place.
 *
 * A salon closes somebody out in one sentence — "that's the colour, plus the
 * shampoo, ninety-four pounds" — and this used to be three controls: amend the
 * price on the booking form, record the bottle as its own sale, then ask for a
 * payment whose amount you worked out yourself. Three transactions for one
 * moment, and a receipt that could never say what the ninety-four was.
 *
 * The work is on the bill at whatever it was booked at, and editable, because
 * the quoted price and the finished price are different numbers more often
 * than not. Changing it here changes the appointment too: a diary saying £95
 * while the till says £115 is two answers about one afternoon.
 */
export function Bill({
  bookingId,
  workName,
  workPence,
  shelf,
  alreadyPence,
  connected,
}: {
  bookingId: string;
  /** What the appointment was for, which is what the line is called. */
  workName: string;
  /** What it was booked at. Null where nobody ever put a price on it. */
  workPence: number | null;
  shelf: ShelfItem[];
  /** What has already been taken at this appointment, so nothing is charged twice. */
  alreadyPence: number | null;
  /** Whether there is a Stripe account for a link to land in. */
  connected: boolean;
}) {
  const [state, action] = useActionState<BillState, FormData>(takePayment, {});
  const [open, setOpen] = useState(false);
  const [work, setWork] = useState(workPence != null ? (workPence / 100).toFixed(2) : "");
  const [lines, setLines] = useState<Line[]>([]);

  const workNow = (() => {
    const pounds = Number(work.replace(/[£,\s]/g, ""));
    return Number.isFinite(pounds) && work.trim() ? Math.round(pounds * 100) : 0;
  })();

  const total =
    workNow +
    lines.reduce((sum, l) => sum + lineTotal({ quantity: l.quantity, unitPence: l.pricePence }), 0);

  const add = (item: ShelfItem) =>
    setLines((all) => {
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
   * Taken, and said where it happened.
   *
   * It does not clear itself. Somebody who has just taken ninety-four pounds
   * wants to see that it was ninety-four, and a panel that resets the instant
   * it succeeds is how you end up unsure whether it went through.
   */
  if (state.ok && !state.url) {
    return (
      <div className="mt-3 border-t border-border pt-3">
        <p className="text-sm text-ok">{formatPence(state.total ?? 0)} taken.</p>
        <p className="hint mt-1">
          On their record, in today&rsquo;s takings, and a receipt has gone to them if they
          have an email address on file.
        </p>
        {state.error && <p className="hint mt-1 text-warn">{state.error}</p>}
      </div>
    );
  }

  if (state.url) {
    return (
      <div className="mt-3 border-t border-border pt-3">
        <p className="text-sm">{formatPence(state.total ?? 0)} to pay.</p>
        {/*
          * The link itself, to hold up to them. Somebody at the desk with the
          * client in front of them wants it on screen; sending it lives on
          * their record and in the conversation, where you are already writing
          * to them.
          */}
        <a
          href={state.url}
          target="_blank"
          rel="noreferrer"
          className="mt-2 block break-all rounded-lg bg-surface-2 px-3 py-2 text-sm text-accent underline"
        >
          {state.url}
        </a>
        <p className="hint mt-1">
          It lands in the takings by itself once they pay. Nothing to write down after.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-3 border-t border-border pt-3">
      {alreadyPence != null && alreadyPence > 0 && (
        <p className="hint mb-2">
          {formatPence(alreadyPence)} already taken at this appointment.
        </p>
      )}

      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="btn-ghost py-1.5 text-sm">
          Take payment
        </button>
      ) : (
        <form action={action} className="space-y-3">
          <input type="hidden" name="booking_id" value={bookingId} />
          <input type="hidden" name="work_name" value={workName} />

          <label className="block">
            <span className="label">For the {workName.toLowerCase()}</span>
            <div className="flex items-center gap-2">
              <input
                name="work"
                value={work}
                onChange={(e) => setWork(e.target.value)}
                inputMode="decimal"
                placeholder="0.00"
                className="input max-w-[8rem] tabular-nums"
                autoFocus
              />
              <span className="hint">
                {/*
                  * What it was booked at, kept visible while it is changed.
                  * "Was it ninety-five?" is the question somebody asks
                  * themselves the moment they start typing over it.
                  */}
                {workPence != null
                  ? `booked at ${formatPence(workPence)}`
                  : "nothing was quoted"}
              </span>
            </div>
            <span className="hint">Leave it empty if the work is already paid for.</span>
          </label>

          {shelf.length > 0 && (
            <div>
              <span className="label">And anything they bought</span>
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
                    {item.stock === 0 && <span className="hint ml-1 text-warn">none left</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {lines.length > 0 && (
            <ul className="space-y-1.5">
              {lines.map((line, i) => (
                <li key={line.key} className="flex items-center gap-2 text-sm">
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
                    aria-label={`Take ${line.name} off the bill`}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-baseline justify-between border-t border-border pt-2">
            <span className="label">Total</span>
            <span className="text-lg font-medium tabular-nums">{formatPence(total)}</span>
          </div>

          {/*
            * How it was paid, as buttons rather than a choice then a confirm.
            *
            * At a desk with somebody's card in their hand, "cash" is the whole
            * decision — and a radio group followed by a submit is two taps for
            * one fact. The value rides on the button that was pressed.
            */}
          <div className="flex flex-wrap items-center gap-2">
            {METHODS.map((m) => (
              <button
                key={m.value}
                name="method"
                value={m.value}
                disabled={total === 0}
                className="btn bg-accent py-1.5 text-sm text-on-accent disabled:opacity-50"
              >
                {m.label}
              </button>
            ))}

            {/*
              * And the other way of taking it. Only where there is an account
              * for the money to land in — a button that can only ever fail is
              * worse than one that is not there, and the fix is on another
              * screen entirely.
              */}
            {connected && (
              <button
                name="method"
                value="link"
                disabled={total === 0}
                className="btn-ghost py-1.5 text-sm disabled:opacity-50"
              >
                Send a link
              </button>
            )}

            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-sm text-muted hover:text-foreground"
            >
              Cancel
            </button>
          </div>

          {!connected && (
            <p className="hint">
              Cash and a card machine are written down, not taken. Connect Stripe in
              Settings and a link appears here too.
            </p>
          )}

          {state.error && <p className="text-sm text-bad">{state.error}</p>}
        </form>
      )}
    </div>
  );
}
