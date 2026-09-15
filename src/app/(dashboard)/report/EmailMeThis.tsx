"use client";

import { useActionState } from "react";
import { emailMeReport, type EmailReportState } from "./actions";

/** Send the report on screen to your own inbox. */
export function EmailMeThis({ range }: { range: { range?: string; from?: string; to?: string; weeks?: string } }) {
  const [state, action, pending] = useActionState<EmailReportState, FormData>(emailMeReport, {});

  if (state.ok) return <span className="text-sm text-ok">Sent to {state.to}</span>;

  return (
    <span className="flex items-center gap-2">
      <button
        type="submit"
        formAction={action}
        formMethod="post"
        disabled={pending}
        className="btn border border-border py-1.5 text-sm disabled:opacity-60"
      >
        {pending ? "Sending…" : "Email me this"}
      </button>
      {Object.entries(range).map(([k, v]) =>
        v ? <input key={k} type="hidden" name={k} value={v} /> : null,
      )}
      {state.error && <span className="text-sm text-warn">{state.error}</span>}
    </span>
  );
}
