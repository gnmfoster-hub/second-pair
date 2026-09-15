"use client";

import { useActionState, useState } from "react";
import { voidForm, type FormActionState } from "../../../../formActions";

/** Stop an unsigned form's link working — sent to the wrong person, or the wrong form. */
export function Withdraw({ id }: { id: string }) {
  const [state, action, pending] = useActionState<FormActionState, FormData>(voidForm, {});
  const [asked, setAsked] = useState(false);

  if (state.ok) return <span className="text-sm text-muted">Withdrawn — the link no longer works.</span>;

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      {asked ? (
        <button disabled={pending} className="btn border border-border text-sm text-warn">
          Yes, withdraw it
        </button>
      ) : (
        <button type="button" onClick={() => setAsked(true)} className="btn border border-border text-sm">
          Withdraw
        </button>
      )}
      {state.error && <span className="text-sm text-warn">{state.error}</span>}
    </form>
  );
}
