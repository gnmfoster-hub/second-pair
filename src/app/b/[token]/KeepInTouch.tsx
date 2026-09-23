"use client";

import { useActionState, useState } from "react";
import { keepInTouch, type KeepState } from "./actions";

/**
 * Asking, once, on the page they are already looking at.
 *
 * Deliberately at the bottom, under everything they came for. Somebody opening
 * this wants to know what time they said; being asked for a marketing
 * permission before that question is answered is how a page gets closed.
 *
 * And deliberately not a pre-ticked box. Under PECR a pre-ticked box is not
 * consent at all, so one would be worse than useless — it would produce a
 * list that looks lawful and is not, which is the only outcome worse than an
 * empty one.
 */
export function KeepInTouch({
  token,
  business,
  hasEmail,
  hasPhone,
  already,
}: {
  token: string;
  business: string;
  hasEmail: boolean;
  hasPhone: boolean;
  /** What they have already said, so this never argues with itself. */
  already: { email: boolean; sms: boolean };
}) {
  const [state, action] = useActionState<KeepState, FormData>(keepInTouch, {});
  const [byEmail, setByEmail] = useState(already.email);
  const [bySms, setBySms] = useState(already.sms);

  if (state.ok) {
    return (
      <section className="mt-8 rounded-xl border border-border bg-surface-2/40 px-4 py-3">
        <p className="text-sm">
          {byEmail || bySms
            ? `Thanks — ${business} will let you know about offers and news.`
            : "Saved. You will only hear from them about your appointments."}
        </p>
        <p className="hint mt-1">You can change this any time from any message they send you.</p>
      </section>
    );
  }

  return (
    <form action={action} className="mt-8 rounded-xl border border-border bg-surface-2/40 px-4 py-4">
      <input type="hidden" name="token" value={token} />

      <h2 className="text-sm font-medium">Hear from {business}?</h2>
      <p className="hint mt-1">
        Offers and news, only if you want them. Nothing to do with your appointment — you
        will always be told about that.
      </p>

      <label className="mt-3 flex items-start gap-2.5 text-sm">
        <input
          type="checkbox"
          name="by_email"
          checked={byEmail}
          onChange={(e) => setByEmail(e.target.checked)}
          className="mt-0.5 accent-[var(--accent)]"
        />
        <span>By email</span>
      </label>

      {/*
        * The address, only when saying yes needs one.
        *
        * Most people in the diary were typed in by somebody on the phone who
        * never asked for an email, so a yes with nowhere to send it is the
        * common case rather than the odd one. Asked for here, at the moment
        * they have just said they want to hear from somebody.
        */}
      {byEmail && !hasEmail && (
        <input
          type="email"
          name="email"
          required
          placeholder="you@example.com"
          className="input mt-2 max-w-xs"
        />
      )}

      {hasPhone && (
        <label className="mt-2 flex items-start gap-2.5 text-sm">
          <input
            type="checkbox"
            name="by_sms"
            checked={bySms}
            onChange={(e) => setBySms(e.target.checked)}
            className="mt-0.5 accent-[var(--accent)]"
          />
          <span>By text</span>
        </label>
      )}

      <div className="mt-3 flex items-center gap-3">
        <button type="submit" className="btn-ghost">
          Save
        </button>
        {state.error && <span className="text-sm text-warn">{state.error}</span>}
      </div>
    </form>
  );
}
