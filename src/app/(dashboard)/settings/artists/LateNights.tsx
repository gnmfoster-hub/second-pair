"use client";

import { useState } from "react";
import type { ExtraHours } from "@/lib/types";

/**
 * "I'll work late on Thursday."
 *
 * Everything else about somebody's availability repeats every week — the
 * business's hours, their own days, their regular time off. This is the one
 * place they can say something about a single date, which is the most ordinary
 * thing a small business does and the thing the assistant could not know.
 *
 * It matters more here than it would in most products, because out of hours is
 * exactly when the assistant is the one answering. Without this it turns away
 * the customer who can only make evenings, on the owner's behalf, at the
 * moment they are least able to notice.
 *
 * Dates in the past are dropped on save rather than shown greyed out. This is
 * a note about a particular evening; once it has been, it is not a setting
 * anybody wants to look at again.
 */
export function LateNights({ extra, noun }: { extra: ExtraHours[]; noun: string }) {
  const [nights, setNights] = useState<ExtraHours[]>(
    [...(extra ?? [])].sort((a, b) => a.date.localeCompare(b.date)),
  );

  const add = () =>
    setNights((was) => [...was, { date: "", open: "17:00", close: "21:00" }]);

  const change = (i: number, patch: Partial<ExtraHours>) =>
    setNights((was) => was.map((n, at) => (at === i ? { ...n, ...patch } : n)));

  const drop = (i: number) => setNights((was) => was.filter((_, at) => at !== i));

  return (
    <div>
      {/*
        * Carried as JSON in one field rather than as indexed inputs.
        *
        * Rows are added and removed here, and indexed names go wrong the
        * moment somebody deletes the middle one — the server sees a gap and
        * has to guess. One value that is either valid or is not removes the
        * guessing.
        */}
      <input type="hidden" name="extra_hours" value={JSON.stringify(nights)} />

      <div className="label">Working late, or coming in specially</div>
      <p className="hint mt-1">
        One-off hours for a particular date. The assistant will offer these times to
        customers as well as this {noun}&rsquo;s usual ones &mdash; useful when somebody
        can only make an evening.
      </p>

      {nights.length > 0 && (
        <div className="mt-3 space-y-2">
          {nights.map((night, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={night.date}
                onChange={(e) => change(i, { date: e.target.value })}
                className="input w-[10.5rem]"
                aria-label="Date"
              />
              <input
                type="time"
                value={night.open}
                onChange={(e) => change(i, { open: e.target.value })}
                className="input w-[6.75rem]"
                aria-label="From"
              />
              <span className="text-sm text-muted">to</span>
              <input
                type="time"
                value={night.close}
                onChange={(e) => change(i, { close: e.target.value })}
                className="input w-[6.75rem]"
                aria-label="Until"
              />
              <button
                type="button"
                onClick={() => drop(i)}
                className="btn-ghost ml-auto"
                aria-label={`Remove ${night.date || "this date"}`}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      <button type="button" onClick={add} className="btn-ghost mt-3">
        Add a date
      </button>
    </div>
  );
}
