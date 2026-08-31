"use client";

import { useState } from "react";
import { DAY_NAMES, type OpeningHours } from "@/lib/types";

/**
 * One person's own working week.
 *
 * Off by default, and off is not a lesser state — most people in most
 * businesses work the business's hours, and making everyone fill in a grid to
 * say so would be worse for the common case to help the rarer one.
 *
 * Switched on, it is the whole reason a salon can describe a stylist who is in
 * on Tuesdays, Thursdays and Saturdays. Before this the assistant offered her
 * a Monday and the salon found out when somebody turned up.
 */
export function OwnHours({
  hours,
  studioHours,
  noun,
}: {
  hours: OpeningHours[] | null;
  /** Shown as the fallback, so it is obvious what "same as the business" means. */
  studioHours: OpeningHours[];
  noun: string;
}) {
  const [own, setOwn] = useState(Boolean(hours?.length));

  const week = DAY_NAMES.map((_, day) => {
    const theirs = hours?.find((h) => h.day === day);
    const business = studioHours.find((h) => h.day === day);
    return theirs ?? business ?? { day, open: "09:00", close: "17:00", closed: true };
  });

  return (
    <div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="own_hours"
          checked={own}
          onChange={(e) => setOwn(e.target.checked)}
          className="accent-[var(--accent)]"
        />
        This {noun} works different days to the rest of the business
      </label>

      {!own && (
        <p className="hint mt-1.5">
          Following the business&rsquo;s opening hours. Most people do.
        </p>
      )}

      {own && (
        <div className="mt-3 space-y-2 rounded-xl border border-border p-3">
          {week.map((day) => (
            <div key={day.day} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="w-20 shrink-0 text-muted">{DAY_NAMES[day.day]}</span>
              <input
                type="time"
                name={`hours_${day.day}_open`}
                defaultValue={day.open}
                className="input w-28 py-1.5"
                aria-label={`${DAY_NAMES[day.day]} from`}
              />
              <span className="text-muted">to</span>
              <input
                type="time"
                name={`hours_${day.day}_close`}
                defaultValue={day.close}
                className="input w-28 py-1.5"
                aria-label={`${DAY_NAMES[day.day]} until`}
              />
              <label className="ml-auto flex items-center gap-1.5 text-xs text-muted">
                <input
                  type="checkbox"
                  name={`hours_${day.day}_closed`}
                  defaultChecked={day.closed}
                  className="accent-[var(--accent)]"
                />
                Not in
              </label>
            </div>
          ))}
          <p className="hint pt-1">
            The assistant will never offer a time outside these, even when the business is
            open and the diary is free.
          </p>
        </div>
      )}
    </div>
  );
}
