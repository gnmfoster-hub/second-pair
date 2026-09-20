"use client";

import { useActionState } from "react";
import { resetThisDemo, type DemoResetState } from "@/app/(dashboard)/demoActions";

/**
 * Putting the demo back, from inside the demo.
 *
 * A demonstration leaves marks. Somebody books a client in to show how it
 * works, cancels one to show what happens, sends a reply in the inbox — and
 * the next person shown it opens a salon with a half-finished conversation and
 * an appointment in somebody's name. Rebuilding it has always been possible
 * and always in the back office, which means it happened when whoever runs the
 * platform remembered rather than after the demonstration that dirtied it.
 *
 * So the button is where the mess is. It only exists on a business marked as a
 * demo — the action checks that itself rather than trusting this — and it says
 * what it will do first, because "reset" next to somebody's diary is a word
 * worth being careful with.
 */
export function DemoReset() {
  const [state, action] = useActionState<DemoResetState, FormData>(resetThisDemo, {});

  return (
    <form action={action} className="card mt-4 flex flex-wrap items-center gap-3 p-4">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">This is the demo salon</div>
        <p className="hint mt-0.5">
          {state.note ??
            "Rebuild it and the week, the inbox and the counter go back to how they were, dated from today. Nothing real is touched."}
        </p>
        {state.error && <p className="mt-1 text-sm text-warn">{state.error}</p>}
      </div>

      <button type="submit" className="btn-ghost shrink-0">
        Put it back
      </button>
    </form>
  );
}
