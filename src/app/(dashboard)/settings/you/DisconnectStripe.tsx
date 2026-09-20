"use client";

import { useActionState, useState } from "react";
import { disconnectMyStripe } from "../actions";
import type { FormState } from "../actions";

/**
 * The way back out of connecting your own Stripe.
 *
 * There was not one. The panel showed a Connected pill and a sentence, and
 * somebody who had set it up and would now rather the business handled their
 * payments had no way to say so. Giles asked for it in exactly those terms.
 *
 * Two presses rather than one, and no browser dialog. This decides where money
 * for somebody's work is taken, so it should not be a single mis-tap on a
 * phone — and a confirm() is the thing people click through without reading.
 * The second press says what will actually happen instead.
 */
export function DisconnectStripe({
  firstName,
  business,
  /** Whether the business can take the payment instead once this is gone. */
  fallback,
}: {
  firstName: string;
  business: string;
  fallback: boolean;
}) {
  const [state, action] = useActionState<FormState, FormData>(disconnectMyStripe, {});
  const [asking, setAsking] = useState(false);

  if (state.ok) {
    return (
      <p className="hint mt-3 max-w-prose">
        Disconnected. Your Stripe account is still yours and nothing that has already been
        paid is affected.{" "}
        {fallback
          ? `Card payments for your work will be taken into ${business}'s account from now on.`
          : `${business} has no account of its own, so card payments for your work cannot be taken until somebody connects one.`}
      </p>
    );
  }

  return (
    <div className="mt-4 border-t border-border pt-4">
      {!asking ? (
        <>
          <button type="button" onClick={() => setAsking(true)} className="btn-ghost">
            Disconnect this account
          </button>
          <p className="hint mt-2 max-w-prose">
            If you would rather {business} took card payments for your work instead.
          </p>
        </>
      ) : (
        <form action={action}>
          <p className="max-w-prose text-sm">
            <strong>Disconnect your Stripe account, {firstName}?</strong>{" "}
            {fallback
              ? `Card payments for your work will be taken into ${business}'s account instead.`
              : `${business} has no account of its own, so card payments for your work will not be possible until somebody connects one.`}{" "}
            Your Stripe account stays yours, and anything already paid is untouched.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn bg-bad text-white hover:brightness-95">
              Yes, disconnect it
            </button>
            <button type="button" onClick={() => setAsking(false)} className="btn-ghost">
              Keep it
            </button>
          </div>
        </form>
      )}

      {state.error && <p className="mt-3 text-sm text-warn">{state.error}</p>}
    </div>
  );
}
