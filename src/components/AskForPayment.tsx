"use client";

import { useActionState, useState } from "react";
import { askForPayment, type PayLinkState } from "@/app/(dashboard)/payLinkActions";
import { formatPence } from "@/lib/money";

/**
 * Asking somebody to pay, wherever you happen to be standing.
 *
 * The same panel on an appointment, a client's record, the conversation you
 * are already having with them and the till — because those are the four
 * places where somebody realises money is owed, and having it in one of them
 * means the other three end up as a card machine or a bank transfer nobody
 * chases.
 *
 * Folded away until asked for. Most appointments never need it, and a payment
 * control open on every screen is one somebody eventually taps by accident.
 */
export function AskForPayment({
  contactId = null,
  bookingId = null,
  artistId = null,
  amountPence,
  description,
  kind = "payment",
  channels = [],
  connected,
  people = [],
  label = "Ask for payment",
}: {
  contactId?: string | null;
  bookingId?: string | null;
  /** Whose takings it is. The column an appointment sits in, usually. */
  artistId?: string | null;
  /** What to put in the box. Null leaves it empty for somebody to type. */
  amountPence?: number | null;
  description: string;
  kind?: "deposit" | "payment";
  /** Ways this client can actually be reached, worked out on the server. */
  channels?: { channel: string; label: string }[];
  /** Whether there is a Stripe account to take money into at all. */
  connected: boolean;
  /**
   * Who it can be taken for, where that decides whose account it lands in.
   *
   * The owner and the desk take money for everybody. On a business that pays
   * each person directly, the one question that matters is whose work it was
   * — so it is asked, and the money goes to that person's own Stripe whoever
   * pressed the button. Not shown with one person or one account.
   */
  people?: { id: string; name: string }[];
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<PayLinkState, FormData>(askForPayment, {});
  const [copied, setCopied] = useState(false);

  /*
   * Nothing to take money into, said before the form rather than after it.
   *
   * Offering a control that can only fail, and finding out why once you have
   * typed an amount and picked a channel, is worse than not offering it — and
   * the fix is a Stripe account rather than anything on this screen.
   */
  if (!connected) {
    return (
      <p className="hint">
        No Stripe account is connected yet, so nothing can be charged. Connect one in
        Settings and this appears here.
      </p>
    );
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-ghost text-sm">
        {label}
      </button>
    );
  }

  return (
    <form action={action} className="rounded-xl border border-border bg-surface-2/40 p-3.5">
      <input type="hidden" name="contact_id" value={contactId ?? ""} />
      <input type="hidden" name="booking_id" value={bookingId ?? ""} />
      {people.length > 1 ? (
        <label className="mb-3 block">
          <span className="label">Whose work is it for</span>
          <select
            name="artist_id"
            defaultValue={artistId && people.some((p) => p.id === artistId) ? artistId : ""}
            className="input"
            required
          >
            <option value="" disabled>
              Choose who
            </option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <input type="hidden" name="artist_id" value={artistId ?? people[0]?.id ?? ""} />
      )}
      <input type="hidden" name="kind" value={kind} />

      <div className="flex flex-wrap items-end gap-3">
        <label className="w-32">
          <span className="label">How much</span>
          <input
            name="amount"
            inputMode="decimal"
            defaultValue={amountPence != null ? (amountPence / 100).toFixed(2) : ""}
            placeholder="0.00"
            className="input tabular-nums"
            autoFocus
          />
        </label>

        <label className="min-w-40 flex-1">
          <span className="label">What for</span>
          <input name="description" defaultValue={description} className="input" />
        </label>
      </div>

      {/*
        * Send it, or hold it up to them.
        *
        * Somebody at the desk with the client in front of them wants it on
        * screen; somebody chasing a balance at nine at night wants it sent.
        * Both are the same action with a different last step, so both are
        * buttons on the same form rather than a mode to choose first.
        */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {channels.map((c) => (
          <button
            key={c.channel}
            type="submit"
            name="send_on"
            value={c.channel}
            className="btn bg-accent text-on-accent text-sm"
          >
            Send on {c.label}
          </button>
        ))}

        <button type="submit" name="send_on" value="" className="btn-ghost text-sm">
          {channels.length ? "Just give me the link" : "Make a link"}
        </button>

        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm text-muted hover:text-foreground"
        >
          Cancel
        </button>
      </div>

      {state.note && <p className="hint mt-2">{state.note}</p>}
      {state.error && <p className="mt-2 text-sm text-warn">{state.error}</p>}

      {state.sentOn && (
        <p className="mt-2 text-sm text-ok">
          Sent. They can pay from the link, and it lands in the takings on its own.
        </p>
      )}

      {/*
        * The link itself, always, even when it was sent.
        *
        * A text can fail to arrive for a dozen reasons nobody here will ever
        * hear about, and the thing that rescues every one of them is being
        * able to read the link out or put it in front of somebody.
        */}
      {state.url && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-lg bg-surface px-2.5 py-1.5 text-xs">
            {state.url}
          </code>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(state.url ?? "").then(
                () => setCopied(true),
                () => setCopied(false),
              );
            }}
            className="btn-ghost text-sm"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      )}

      <p className="hint mt-2">
        {amountPence != null && `${formatPence(amountPence)} by default. `}
        The link stops working after a day, and the money goes straight to the Stripe
        account of whoever it is for.
      </p>
    </form>
  );
}
