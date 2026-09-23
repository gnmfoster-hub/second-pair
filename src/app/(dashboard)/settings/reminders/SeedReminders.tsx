"use client";

import { useActionState } from "react";
import { seedStarterReminders, type FormState } from "../actions";

/**
 * A way back to the trade's usual reminders.
 *
 * Shown only when there are none, which is a state a business can reach two
 * ways: it was created before new businesses were given them, or somebody
 * deleted them and thought better of it. Either way the only alternative was
 * writing two of them out from an empty box, guessing what a reminder ought to
 * say — and the wording is the part worth having.
 */
export function SeedReminders({ trade }: { trade: string }) {
  /* The label for a business that has not picked a trade, which is not a trade. */
  const generic = /^something else$/i.test(trade.trim());

  const [state, action] = useActionState<FormState, FormData>(seedStarterReminders, {});

  return (
    <form action={action} className="card border-dashed p-5">
      <div className="section-title">You have no reminders set up</div>
      {/*
        * "the two most something else businesses send".
        *
        * The trade's own label goes into the sentence, and the label for a
        * business that has not picked one is "Something else" — so the
        * generic case read as nonsense, which is exactly the business most
        * likely to be sitting on this screen with nothing set up.
        *
        * Also "the two most X businesses send" was missing its "that". Read
        * aloud it is "the two that most tattoo businesses send".
        */}
      <p className="hint mt-1 max-w-prose">
        Nobody is being reminded of their appointment. Start with the two that most{" "}
        {generic ? "" : `${trade.toLowerCase()} `}businesses send: one two days before, one
        the day before, and change the wording to yours. Or write your own below.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="submit" className="btn bg-accent text-on-accent">
          Add the usual two
        </button>
        {state.ok && <span className="hint">Added. Have a read and change anything.</span>}
        {state.error && <span className="text-sm text-warn">{state.error}</span>}
      </div>
    </form>
  );
}
