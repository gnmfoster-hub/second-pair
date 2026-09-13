"use client";

import { useActionState } from "react";
import { setNotifyEveryEnquiry, type FormState } from "./actions";

/**
 * Hearing about every enquiry, not only the ones that need you.
 *
 * A business is told when a booking becomes real, when the assistant hands a
 * conversation over, and when it stands back for the owner to answer first. An
 * enquiry the assistant handled start to finish sends nothing, deliberately —
 * the whole point is that it did not need anybody.
 *
 * That is right for most people and wrong for some, and being unable to ask
 * reads as the product hiding its work.
 *
 * The business's, so it lives with the business settings. It spent an hour on
 * Settings → You, which was wrong and made a real confusion worse: that page is
 * meant to hold what belongs to whoever is signed in, and an owner is both a
 * person and the business, so anything of the business's sitting there teaches
 * everybody that the page is a mixture. What each person is told about their
 * own appointments is the thing that belongs on their own page.
 */
export function EveryEnquiry({ on }: { on: boolean }) {
  const [state, action] = useActionState<FormState, FormData>(setNotifyEveryEnquiry, {});

  return (
    <form action={action} className="card p-5">
      <div className="section-title">What you are told about</div>

      <p className="hint mt-1.5 max-w-prose">
        You are always told when somebody is booked in, when the assistant hands a
        conversation over, and when it holds back for you to answer first. An enquiry it
        answered on its own sends nothing &mdash; because nothing needed you.
      </p>

      <label className="mt-4 flex items-start gap-2.5 text-sm">
        <input
          type="checkbox"
          name="on"
          defaultChecked={on}
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
          className="mt-0.5"
        />
        <span>
          Tell me about every enquiry as well
          <span className="hint block">
            One notification the first time the assistant replies to somebody new. Worth
            having while you are still deciding whether to trust it, and worth turning off
            once you do &mdash; an alert for everything is how the one that mattered gets
            ignored.
          </span>
        </span>
      </label>

      {state.error && <p className="mt-3 text-sm text-warn">{state.error}</p>}
      {state.ok && <p className="mt-3 text-sm text-ok">Saved.</p>}
    </form>
  );
}
