"use client";

import { useActionState } from "react";
import { setMyPreferences, type PrefsState } from "./actions";
import type { MarketingChoice } from "@/lib/consent";

/**
 * Two switches and a save, which is the whole page.
 *
 * A channel they have no address for is shown and disabled rather than hidden:
 * "we have no number for you" is a useful thing for somebody to learn here,
 * and a switch that quietly is not there reads as a bug.
 */
export function Preferences({
  token,
  business,
  has,
  choice,
}: {
  token: string;
  business: string;
  has: { email: boolean; sms: boolean };
  choice: MarketingChoice;
}) {
  const [state, action, pending] = useActionState<PrefsState, FormData>(setMyPreferences, {});
  const now = state.saved ?? choice;

  return (
    <form action={action} className="card mt-5 space-y-4 p-5">
      <input type="hidden" name="token" value={token} />

      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          name="email"
          defaultChecked={now.email}
          disabled={!has.email}
          className="mt-1 size-5 accent-[var(--accent)]"
        />
        <span className="min-w-0">
          <span className="font-medium">Email me</span>
          <span className="hint block">
            {has.email
              ? "Offers and news by email, now and then."
              : `${business} has no email address for you, so there is nothing to switch on.`}
          </span>
        </span>
      </label>

      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          name="sms"
          defaultChecked={now.sms}
          disabled={!has.sms}
          className="mt-1 size-5 accent-[var(--accent)]"
        />
        <span className="min-w-0">
          <span className="font-medium">Text me</span>
          <span className="hint block">
            {has.sms
              ? "The occasional text: a cancellation you might want, or something on offer."
              : `${business} has no mobile number for you, so there is nothing to switch on.`}
          </span>
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <button disabled={pending} className="btn bg-accent text-on-accent disabled:opacity-60">
          {pending ? "Saving…" : "Save what I have chosen"}
        </button>
        {state.ok && <span className="text-sm text-ok">Saved. Thank you.</span>}
        {state.error && <span className="text-sm text-warn">{state.error}</span>}
      </div>
    </form>
  );
}
