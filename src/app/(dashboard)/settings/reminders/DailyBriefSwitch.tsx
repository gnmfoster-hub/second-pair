"use client";

import { useActionState, useState } from "react";
import { setDailyBrief, type DailyBriefState } from "./actions";

/**
 * "Email me the day's diary every morning", for the owner.
 *
 * Off until somebody asks for it. A product that starts emailing a business
 * every morning without being asked has decided something on their behalf,
 * and the first one arrives at seven.
 */
export function DailyBriefSwitch({ on }: { on: boolean }) {
  const [state, action] = useActionState<DailyBriefState, FormData>(setDailyBrief, {});
  const [checked, setChecked] = useState(on);

  return (
    <form action={action} className="flex flex-wrap items-center gap-2 text-sm">
      <label className="flex items-center gap-2">
        <input
          id="daily-brief"
          type="checkbox"
          name="on"
          checked={checked}
          onChange={(e) => {
            setChecked(e.target.checked);
            e.currentTarget.form?.requestSubmit();
          }}
          className="accent-[var(--accent)]"
        />
        Email the day ahead every morning
      </label>
      {state.ok && <span className="text-ok">Saved</span>}
      {state.error && <span className="text-warn">{state.error}</span>}
    </form>
  );
}
