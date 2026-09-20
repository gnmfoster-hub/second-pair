"use client";

import { useActionState } from "react";
import { resendReceipt, type ClientState } from "./actions";

/**
 * Send this receipt again.
 *
 * Small on purpose. It sits beside a payment that already happened and the
 * only interesting outcomes are "gone" and a reason it did not — there is
 * nothing to fill in, so a dialog would be three clicks around a single fact.
 */
export function SendReceipt({
  paymentId,
  contactId,
}: {
  paymentId: string;
  contactId: string;
}) {
  const [state, action, pending] = useActionState<ClientState, FormData>(resendReceipt, {});

  if (state.ok) return <span className="text-ok">Receipt sent</span>;

  return (
    <form action={action} className="inline">
      <input type="hidden" name="payment_id" value={paymentId} />
      <input type="hidden" name="contact_id" value={contactId} />
      <button
        type="submit"
        disabled={pending}
        className="text-accent hover:underline disabled:opacity-50"
      >
        {pending ? "Sending…" : "Email receipt"}
      </button>
      {/* The reason, where there is one: an address they never gave, most
          often, which is not an error worth a red box. */}
      {state.error && <span className="ml-2 text-warn">{state.error}</span>}
    </form>
  );
}
