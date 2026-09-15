"use client";

import { useActionState, useState } from "react";
import { SendLink } from "./SendLink";
import { capital, whatTheyHad, type Words } from "@/lib/wordsText";
import { completeAppointment, type BillState } from "./billActions";
import { lineTotal } from "@/lib/sales";
import { formatPence } from "@/lib/money";
import type { Bookable } from "./ServicePick";

export type ShelfItem = {
  id: string;
  name: string;
  pricePence: number | null;
  /** How many are left, where the shop counts them. Null is not counting. */
  stock: number | null;
  /** Whose it is. Null is the shop's, and on everybody's shelf. */
  ownerId: string | null;
};

type Line = { key: number; serviceId: string | null; name: string; quantity: number; pricePence: number };
let nextKey = 1;

/**
 * Completing an appointment, as one screen and one tap.
 *
 * Asked for over and over as "a complete button", and for a long time answered
 * with a row of separate controls: whether they came in one place, the price
 * in another, the bottle in a third, the money in a fourth, each saving on its
 * own. Every one of them worked. Together they were a form you had to know how
 * to operate, and an appointment was finished only if somebody remembered to
 * press all four.
 *
 * So: one button on the appointment. It opens one screen that asks what it
 * needs to, in the order it happens at a desk — did they come, what did they
 * have, did they buy anything, how did they pay — with the answers already
 * filled in from the booking. The last tap does all of it.
 */
export function Complete({
  bookingId,
  clientName,
  workName,
  workPence,
  services,
  shelf,
  connected,
  attended,
  travels = false,
  words,
  alreadyPence,
  bookedMinutes,
  startOpen = false,
  onCancel,
  onDone,
}: {
  bookingId: string;
  clientName: string | null;
  workName: string;
  workPence: number | null;
  /** The price list, so "what they had" can be changed to something else on it. */
  services: Bookable[];
  shelf: ShelfItem[];
  connected: boolean;
  /** Whether it has already been closed off, and which way. */
  attended: boolean | null;
  /**
   * Whether the work happens at the customer's address. "Did they come?" is
   * right for a salon and backwards for a cleaner, who went to them.
   */
  travels?: boolean;
  /** What this business calls things, from its trade and its own changes. */
  words: Words;
  /** What has already been taken at this appointment. */
  alreadyPence: number | null;
  bookedMinutes: number;
  /** Straight to the questions, when the appointment already offered the button. */
  startOpen?: boolean;
  /** Where Cancel goes, when this is not the one holding the button. */
  onCancel?: () => void;
  /** Where "back to the diary" goes once it is done. */
  onDone?: () => void;
}) {
  const [state, action, pending] = useActionState<BillState, FormData>(completeAppointment, {});
  const [open, setOpen] = useState(startOpen);
  const [came, setCame] = useState(true);
  const [what, setWhat] = useState(workName);
  const [price, setPrice] = useState(workPence != null ? (workPence / 100).toFixed(2) : "");
  const [lines, setLines] = useState<Line[]>([]);

  const firstName = (clientName ?? "").split(" ")[0] || "them";

  const pricePence = (() => {
    const pounds = Number(price.replace(/[£,\s]/g, ""));
    return price.trim() && Number.isFinite(pounds) ? Math.round(pounds * 100) : 0;
  })();

  const total =
    pricePence +
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
        { key: nextKey++, serviceId: item.id, name: item.name, quantity: 1, pricePence: item.pricePence ?? 0 },
      ];
    });

  /*
   * Changing what they had changes the price with it, from the price list —
   * a cut that became a colour costs what a colour costs. Still editable
   * afterwards, because a shop discounts.
   */
  const chooseService = (id: string) => {
    const service = services.find((s) => s.id === id);
    if (!service) return;
    setWhat(service.name);
    if (service.price_pence != null) setPrice((service.price_pence / 100).toFixed(2));
  };

  // ────────────────────────────────────────────── finished, and says how
  if (state.ok && state.completed) {
    return (
      <div className="rounded-xl border border-ok/30 bg-ok/5 p-4">
        <div className="font-medium text-ok">
          {state.completed === "no-show" ? "Marked as a no-show" : "Completed"}
        </div>
        <p className="hint mt-1">
          {state.completed === "no-show"
            ? "Counted on their record and in the report. Any deposit stays where it is."
            : (state.total ?? 0) > 0
              ? state.url
                ? `${formatPence(state.total ?? 0)} to pay by link. Send it to them below — it marks itself paid when they pay.`
                : `${formatPence(state.total ?? 0)} taken. On their record, in today's takings, and a receipt has gone to ${firstName} if they have an email address.`
              : "Closed off with nothing taken today."}
        </p>
        {state.url && state.paymentId && (
          <SendLink url={state.url} paymentId={state.paymentId} sendTo={state.sendTo ?? []} />
        )}
        {state.error && <p className="hint mt-1 text-warn">{state.error}</p>}
        {onDone && (
          <button type="button" onClick={onDone} className="btn mt-3 w-full">
            Back to the diary
          </button>
        )}
      </div>
    );
  }

  // ─────────────────────────────────────────────── the button, before
  if (!open) {
    return (
      <div className="space-y-1.5">
        {attended != null && (
          <p className="hint">
            {attended ? "Completed" : "Marked as a no-show"}
            {alreadyPence ? ` · ${formatPence(alreadyPence)} taken` : ""}
          </p>
        )}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="btn w-full bg-accent py-2.5 text-on-accent"
        >
          {attended == null ? "Complete" : "Complete again"}
        </button>
      </div>
    );
  }

  // ───────────────────────────────────────────────────── the screen
  return (
    <form
      action={action}
      className={startOpen ? "space-y-4" : "space-y-4 rounded-xl border border-border bg-surface p-4"}
    >
      <input type="hidden" name="booking_id" value={bookingId} />
      <input type="hidden" name="attended" value={came ? "yes" : "no"} />
      <input type="hidden" name="work_name" value={what} />
      <input type="hidden" name="work" value={price} />
      {lines.map((line, i) => (
        <span key={line.key} hidden>
          <input type="hidden" name={`service_${i}`} value={line.serviceId ?? ""} />
          <input type="hidden" name={`name_${i}`} value={line.name} />
          <input type="hidden" name={`qty_${i}`} value={line.quantity} />
          <input type="hidden" name={`price_${i}`} value={(line.pricePence / 100).toFixed(2)} />
        </span>
      ))}

      {/* The sheet already says Complete and has a way back when it opened straight here. */}
      <div className={startOpen ? "hidden" : "flex items-baseline justify-between gap-3"}>
        <div className="font-medium">Complete{clientName ? ` — ${clientName}` : ""}</div>
        <button
          type="button"
          onClick={() => (onCancel ? onCancel() : setOpen(false))}
          className="text-sm text-muted hover:text-foreground"
        >
          Cancel
        </button>
      </div>

      {/* 1 ─ did they come. Yes already chosen, because nearly everybody does. */}
      <div>
        <span className="label">{travels ? `Did the ${words.service} go ahead?` : `Did ${firstName} come?`}</span>
        <div className="mt-1 flex gap-2">
          <button
            type="button"
            onClick={() => setCame(true)}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm ${
              came ? "border-ok bg-ok/10 text-ok" : "border-border text-muted"
            }`}
          >
            {travels ? `${capital(words.service)} done` : "Yes"}
          </button>
          <button
            type="button"
            onClick={() => setCame(false)}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm ${
              !came ? "border-warn bg-warn/10 text-warn" : "border-border text-muted"
            }`}
          >
            {travels ? "Nobody in" : "No-show"}
          </button>
        </div>
      </div>

      {!came && (
        <button
          type="submit"
          disabled={pending}
          className="btn w-full bg-warn py-2.5 text-white disabled:opacity-60"
        >
          {pending ? "Saving…" : "Mark as a no-show"}
        </button>
      )}

      {came && (
        <>
          {/* 2 ─ what they had, and what it came to. */}
          <div>
            <span className="label">{whatTheyHad(words)}</span>
            <div className="mt-1 flex gap-2">
              {services.length > 0 ? (
                <select
                  value={services.find((s) => s.name === what)?.id ?? ""}
                  onChange={(e) => chooseService(e.target.value)}
                  className="input min-w-0 flex-1"
                >
                  {!services.some((s) => s.name === what) && <option value="">{what}</option>}
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={what}
                  onChange={(e) => setWhat(e.target.value)}
                  className="input min-w-0 flex-1"
                />
              )}
              <input
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                inputMode="decimal"
                placeholder="0.00"
                aria-label="What it came to"
                className="input w-24 text-right tabular-nums"
              />
            </div>
            {workPence != null && pricePence !== workPence && (
              <p className="hint mt-1">Booked at {formatPence(workPence)}.</p>
            )}
          </div>

          {/*
            * 3 ─ anything else on the bill: something off the shelf, or
            * something typed in.
            *
            * Shown for every business now, not only one with a shelf. The
            * commonest extra is not a product at all — a fringe trim thrown in
            * for a fiver, a call-out charge, parking, a broken part replaced —
            * and with nowhere to put it the money went on the bill as a
            * higher price for the work, which is the wrong line in the takings
            * and the wrong thing on the receipt.
            */}
          <div>
              <span className="label">Anything else on the bill</span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {shelf.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => add(item)}
                    disabled={item.stock === 0}
                    className="rounded-lg border border-border px-2.5 py-1.5 text-sm hover:border-accent/40 disabled:opacity-40"
                  >
                    + {item.name}{" "}
                    <span className="hint tabular-nums">
                      {item.pricePence == null ? "" : formatPence(item.pricePence)}
                    </span>
                  </button>
                ))}
              </div>
              {lines.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {lines.map((line) => (
                    <li key={line.key} className="flex items-center gap-2 text-sm">
                      <span className="min-w-0 flex-1 truncate">
                        {line.quantity > 1 ? `${line.quantity} × ${line.name}` : line.name}
                      </span>
                      <span className="tabular-nums">
                        {formatPence(line.quantity * line.pricePence)}
                      </span>
                      <button
                        type="button"
                        onClick={() => setLines((all) => all.filter((l) => l.key !== line.key))}
                        className="hint hover:text-foreground"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <Extra
                onAdd={(name, pence) =>
                  setLines((all) => [...all, { key: nextKey++, serviceId: null, name, quantity: 1, pricePence: pence }])
                }
              />
          </div>

          <div className="flex items-baseline justify-between border-t border-border pt-3">
            <span className="label">Total</span>
            <span className="text-xl font-semibold tabular-nums">{formatPence(total)}</span>
          </div>

          {/* How long it really took — useful, never required, so folded. */}
          <details>
            <summary className="cursor-pointer text-sm text-muted">
              How long did it actually take?
            </summary>
            <div className="mt-2 flex items-center gap-2">
              <input
                name="actual_minutes"
                type="number"
                min={5}
                step={5}
                placeholder={String(bookedMinutes)}
                className="input w-24"
              />
              <span className="hint">minutes — booked for {bookedMinutes}</span>
            </div>
          </details>

          {/* 4 ─ how they paid. The button pressed is the answer, and it finishes. */}
          <div>
            <span className="label">How did they pay?</span>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {[
                { value: "cash", label: "Cash" },
                { value: "card", label: "Card machine" },
                { value: "phone", label: "Tapped on a phone" },
                ...(connected ? [{ value: "link", label: "Send a payment link" }] : []),
              ].map((option) => (
                <button
                  key={option.value}
                  type="submit"
                  name="method"
                  value={option.value}
                  disabled={pending || total <= 0}
                  className="btn bg-accent py-2.5 text-sm text-on-accent disabled:opacity-50"
                >
                  {option.label}
                </button>
              ))}
            </div>
            <button
              type="submit"
              name="method"
              value="none"
              disabled={pending}
              className="btn-ghost mt-2 w-full py-2 text-sm"
            >
              Already paid, or no charge today
            </button>
            {!connected && (
              <p className="hint mt-2">
                Connect Stripe in Settings and you can send them a link to pay on their phone as
                well.
              </p>
            )}
          </div>
        </>
      )}

      {state.error && <p className="text-sm text-bad">{state.error}</p>}
    </form>
  );
}

/**
 * Something that is not on the shelf, typed in with its price.
 *
 * Kept as its own line with no product behind it, so it reaches the receipt
 * and the takings under the name it was given, and never touches stock.
 */
function Extra({ onAdd }: { onAdd: (name: string, pence: number) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const pence = Math.round(Number(price.replace(/[£,\s]/g, "")) * 100);
  const valid = name.trim().length > 0 && Number.isFinite(pence) && pence > 0;

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-2 text-sm text-accent hover:underline">
        + Something else
      </button>
    );
  }

  const add = () => {
    if (!valid) return;
    onAdd(name.trim().slice(0, 120), pence);
    setName("");
    setPrice("");
    setOpen(false);
  };

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <input
        id="extra-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add();
          }
        }}
        placeholder="What it is"
        aria-label="What it is"
        className="input min-w-0 flex-1"
        autoFocus
      />
      <input
        id="extra-price"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add();
          }
        }}
        inputMode="decimal"
        placeholder="0.00"
        aria-label="Price"
        className="input w-24 text-right tabular-nums"
      />
      <button type="button" onClick={add} disabled={!valid} className="btn border border-border text-sm disabled:opacity-50">
        Add
      </button>
      <button type="button" onClick={() => setOpen(false)} className="text-sm text-muted hover:text-foreground">
        Cancel
      </button>
    </div>
  );
}
