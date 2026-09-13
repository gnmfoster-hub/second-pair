"use client";

import { useActionState } from "react";
import { setPaymentModel, type FormState } from "./actions";

/**
 * Whose money it is, and who may take it.
 *
 * A salon with employees and a salon of chair renters are different businesses
 * wearing the same trade. The first wants one Stripe account and settles up
 * however it already does; the second wants an account each, because the money
 * was never the shop's to hold.
 *
 * Deposits and payments are separate switches because they are separate
 * questions. Plenty of trades take a deposit and invoice the rest; plenty take
 * the whole thing on the day and never hold a deposit at all.
 */
export function PaymentModel({
  model,
  takesPayments,
  fallback,
  connected,
  words,
}: {
  model: "business" | "people";
  takesPayments: boolean;
  fallback: boolean;
  /** Whether the business has connected its own Stripe. */
  connected: boolean;
  words: { practitioners: string };
}) {
  const [state, action] = useActionState<FormState, FormData>(setPaymentModel, {});

  return (
    <form action={action} className="card p-5">
      <div className="section-title">Taking money</div>

      <p className="hint mt-1.5 max-w-prose">
        Money goes straight to a Stripe account you control. It never passes through
        Second Pair, and we never hold it &mdash; which keeps us out of the business of
        looking after other people&rsquo;s money, and you out of waiting for us to pass
        it on.
      </p>

      <fieldset className="mt-4">
        <legend className="label">Whose account does it land in</legend>

        <label className="mt-1 flex items-start gap-2.5 text-sm">
          <input type="radio" name="payment_model" value="business" defaultChecked={model === "business"} className="mt-0.5" />
          <span>
            One account, for the business
            <span className="hint block">
              Everybody&rsquo;s takings land in the same place and you settle up with the
              team however you already do. Right where people are employed.
            </span>
          </span>
        </label>

        <label className="mt-3 flex items-start gap-2.5 text-sm">
          <input type="radio" name="payment_model" value="people" defaultChecked={model === "people"} className="mt-0.5" />
          <span>
            An account each
            <span className="hint block">
              Their money never touches yours. Right where every chair is its own
              business &mdash; and each of the {words.practitioners} connects their own
              Stripe, which means their own ID and bank details, not yours.
            </span>
          </span>
        </label>
      </fieldset>

      {/*
       * Only meaningful on the per-person model, and shown only there — a
       * switch about what happens when somebody has no account of their own is
       * noise on a business that has one account for everybody.
       */}
      {model === "people" && (
        <label className="mt-4 flex items-start gap-2.5 rounded-lg bg-surface-2 p-3 text-sm">
          <input type="checkbox" name="payment_fallback" defaultChecked={fallback} className="mt-0.5" />
          <span>
            If somebody has not connected Stripe yet, take it into the business account
            <span className="hint block">
              Off, a payment for them simply cannot be taken and says why &mdash; which
              is the safer answer, because money arriving somewhere nobody chose is worse
              than a payment that plainly did not happen. On, it lands with you and you
              owe them it.
            </span>
          </span>
        </label>
      )}

      <label className="mt-4 flex items-start gap-2.5 text-sm">
        <input type="checkbox" name="takes_payments" defaultChecked={takesPayments} className="mt-0.5" />
        <span>
          Take the full amount, not only deposits
          <span className="hint block">
            Separate from deposits on purpose. Plenty of trades take a deposit and invoice
            the rest; plenty take the lot on the day and never hold a deposit.
          </span>
        </span>
      </label>

      {!connected && (
        <p className="mt-4 rounded-lg bg-warn/10 px-3 py-2 text-sm text-warn">
          <strong>No Stripe account is connected yet.</strong> Nothing can be charged
          until one is, whichever of these is chosen.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button className="btn bg-accent text-on-accent">Save</button>
        {state.error && <p className="text-sm text-warn">{state.error}</p>}
        {state.ok && <p className="text-sm text-ok">Saved.</p>}
      </div>
    </form>
  );
}
