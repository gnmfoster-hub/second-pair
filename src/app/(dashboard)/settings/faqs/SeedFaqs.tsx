"use client";

import { useActionState } from "react";
import { seedStarterFaqs, type FormState } from "../actions";

/**
 * The questions this trade gets asked that this business has no answer for.
 *
 * The page used to list six topics as prose — the same six for a tattooist, a
 * dog groomer and a gas engineer — which told somebody what to think about and
 * left them to do the typing. These are the trade's own questions, only the
 * ones missing, and adding them is a button.
 *
 * It matters more than it looks. Every question a customer asks that has no
 * answer here becomes an interruption for the owner, every time, forever —
 * which is the thing they are paying to stop.
 */
export function SeedFaqs({ missing }: { missing: string[] }) {
  const [state, action] = useActionState<FormState, FormData>(seedStarterFaqs, {});

  if (!missing.length) return null;

  return (
    <form action={action} className="card border-dashed p-5">
      <div className="section-title">
        {missing.length} question{missing.length === 1 ? "" : "s"} your trade gets asked
        that you have no answer for
      </div>
      <p className="hint mt-1 max-w-prose">
        Anything not answered here is handed to you instead — every time somebody asks.
        Add them and fill in the answers in your own words.
      </p>

      <ul className="mt-3 space-y-1 text-sm text-muted">
        {missing.map((q) => (
          <li key={q}>{q}</li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="submit" className="btn bg-accent text-on-accent">
          Add {missing.length === 1 ? "it" : "them"}
        </button>
        {state.ok && <span className="hint">Added below — they do nothing until answered.</span>}
        {state.error && <span className="text-sm text-warn">{state.error}</span>}
      </div>
    </form>
  );
}
