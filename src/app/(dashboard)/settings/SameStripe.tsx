"use client";

import { useActionState } from "react";
import { useMyStripeForTheBusiness } from "./actions";
import type { FormState } from "./actions";

/**
 * One account, where the owner is also one of the people doing the work.
 *
 * The product treats the business's Stripe and each person's own as separate
 * things, which is right for a salon of chair renters and wrong for nearly
 * everybody else: a sole trader, or an owner who also takes bookings, has one
 * Stripe account and no intention of opening a second. They connected theirs,
 * were told the business had none, and the only way forward was to go through
 * Stripe's onboarding again for the same account.
 *
 * So: a switch. It points the business at the account they have already
 * connected, and turns back off again without touching Stripe at all.
 */
export function SameStripe({
  mine,
  business,
  firstName,
}: {
  /** The owner's own connected account, if they have one. */
  mine: string | null;
  /** What the business is pointed at now. */
  business: string | null;
  firstName: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    useMyStripeForTheBusiness,
    {},
  );

  const sharing = Boolean(mine && business && mine === business);
  const separate = Boolean(mine && business && mine !== business);

  // Nothing to offer somebody who has not connected an account of their own.
  if (!mine) return null;

  return (
    <div className="mt-4 rounded-lg bg-surface-2 p-3 text-sm">
      <form action={action} className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
        <input type="hidden" name="use" value={sharing ? "off" : "on"} />
        <span className="min-w-0 flex-1">
          {sharing ? (
            <>
              The business is using <strong>your own Stripe account</strong>
              <span className="hint block">
                Deposits and payments that are the business&rsquo;s land in the same account as
                yours, which is the usual answer when you are one of the people doing the
                work. Nothing was opened for it; it is the account you connected.
              </span>
            </>
          ) : separate ? (
            <>
              The business has a <strong>different</strong> Stripe account from yours
              <span className="hint block">
                That is right if the business banks separately from you. If it should be the
                same one, this points it at yours instead.
              </span>
            </>
          ) : (
            <>
              Use your own Stripe as the business&rsquo;s account
              <span className="hint block">
                Most owners have one Stripe account, not two. This points the business at the
                one you have already connected, {firstName}, no second sign-up, and you can
                undo it here.
              </span>
            </>
          )}
        </span>

        <button
          disabled={pending}
          className={`btn shrink-0 text-sm ${sharing ? "border border-border" : "bg-accent text-on-accent"}`}
        >
          {pending ? "One moment…" : sharing ? "Use a different one" : "Use mine"}
        </button>
      </form>

      {state.error && <p className="mt-2 text-warn">{state.error}</p>}
      {state.ok && <p className="mt-2 text-ok">Saved.</p>}
    </div>
  );
}
