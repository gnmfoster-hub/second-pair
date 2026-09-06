"use client";

import { useActionState, useState } from "react";
import { setRetention, type FormState } from "../actions";

/**
 * How long enquiries that came to nothing are kept.
 *
 * The other half of this page. Everything above is about getting your data
 * out; this is about how long any of it stays, which is the half the law has
 * an opinion on — personal data kept no longer than is necessary for what it
 * was collected for.
 *
 * The forgetting itself was built during the data review and has never once
 * run, because nothing could set this: it read null for every business, null
 * means keep everything, and so every price enquiry anybody has ever made is
 * still sitting there. A control nobody can reach is the same as no control,
 * only harder to notice.
 *
 * What it will and will not remove is spelled out rather than summarised. This
 * is a switch that deletes things, and somebody flipping it deserves to know
 * exactly what leaves — particularly that their actual customers do not.
 */
export function Retention({ months }: { months: number | null }) {
  const [state, action] = useActionState<FormState, FormData>(setRetention, {});
  const [keeping, setKeeping] = useState(months != null);

  return (
    <form action={action} className="card mt-8 space-y-4 p-5">
      <div>
        <h2 className="section-title">How long enquiries are kept</h2>
        <p className="hint mt-1">
          Somebody who asked a price and never came in is a stranger whose details you
          are still holding. The law asks you to keep them no longer than you need
          them, and &ldquo;forever&rdquo; is a hard answer to defend.
        </p>
      </div>

      <label className="row flex items-center gap-2.5 text-sm">
        <input
          type="radio"
          name="mode"
          checked={!keeping}
          onChange={() => setKeeping(false)}
        />
        <span>Keep everything, indefinitely</span>
      </label>

      <label className="row flex items-center gap-2.5 text-sm">
        <input
          type="radio"
          name="mode"
          checked={keeping}
          onChange={() => setKeeping(true)}
        />
        <span className="flex flex-wrap items-center gap-2">
          Delete unbooked enquiries after
          <input
            type="number"
            name="keep_months"
            min={6}
            max={120}
            defaultValue={months ?? 24}
            disabled={!keeping}
            className="input w-20"
            onFocus={() => setKeeping(true)}
          />
          months
        </span>
      </label>

      {/*
        * Spelled out, because this is the sentence that decides whether an
        * owner dares to turn it on. Losing a client history to a setting you
        * did not fully understand would be unforgivable, so the limits are
        * stated before the button rather than in a help page after it.
        */}
      <div className="hint space-y-1 border-t border-border pt-3">
        <p>
          <strong>What goes:</strong> conversations that never became an appointment,
          older than the period, and the person&rsquo;s details if nothing else of
          theirs remains.
        </p>
        <p>
          <strong>What stays:</strong> anybody who has ever booked, everything about
          them, and every appointment in your diary. Your customers are not touched.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" className="btn bg-accent text-on-accent">
          Save
        </button>
        {state.ok && <span className="hint">Saved.</span>}
        {state.error && <span className="text-sm text-warn">{state.error}</span>}
      </div>
    </form>
  );
}
