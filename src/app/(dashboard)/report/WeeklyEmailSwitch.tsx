"use client";

import { useActionState, useState } from "react";
import { setWeeklyEmail, type EmailReportState } from "./actions";

/** "Email me last week's report every Monday", for the owner. */
export function WeeklyEmailSwitch({ on }: { on: boolean }) {
  const [state, action] = useActionState<EmailReportState, FormData>(setWeeklyEmail, {});
  const [checked, setChecked] = useState(on);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2 text-sm">
      <label className="flex items-center gap-2">
        <input
          id="weekly-email"
          type="checkbox"
          name="on"
          checked={checked}
          onChange={(e) => {
            setChecked(e.target.checked);
            e.currentTarget.form?.requestSubmit();
          }}
          className="accent-[var(--accent)]"
        />
        Email the owners last week&rsquo;s report every Monday morning
      </label>
      {state.ok && <span className="text-ok">Saved</span>}
      {state.error && <span className="text-warn">{state.error}</span>}
    </form>
  );
}
