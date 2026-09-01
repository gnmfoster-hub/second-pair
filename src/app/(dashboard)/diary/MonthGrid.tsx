"use client";

import Link from "next/link";
import { hueFor, type ColourMode } from "@/lib/diaryColour";
import type { Entry } from "./WeekGrid";

/**
 * A month at a glance.
 *
 * The question this answers is the one day and week cannot: how does October
 * look. A tattooist books six weeks out and a salon owner wants to know which
 * weeks are thin before deciding whether to run an offer — and until now the
 * only way to find out was to page through the weeks one at a time.
 *
 * Deliberately not a third calendar. It shows how full a day is and what is on
 * it, and clicking a day hands over to the day view, which is where the work
 * actually happens. Trying to drag appointments around at this scale would be
 * a worse version of the week.
 */

/** How many entries fit in a cell before the rest become a count. */
const SHOWN_PER_DAY = 3;

export function MonthGrid({
  weeks,
  entries,
  monthIndex,
  todayKey,
  timezone,
  colourBy,
}: {
  /** Whole weeks covering the month, so the grid is always rectangular. */
  weeks: string[][];
  entries: Entry[];
  /** 0-11, to grey the days either side that belong to another month. */
  monthIndex: number;
  todayKey: string;
  timezone: string;
  colourBy: ColourMode;
}) {
  const byDay = new Map<string, Entry[]>();
  for (const entry of entries) {
    const key = dayKey(entry.starts_at, timezone);
    const list = byDay.get(key);
    if (list) list.push(entry);
    else byDay.set(key, [entry]);
  }

  return (
    <div className="card overflow-hidden">
      <div className="grid grid-cols-7 border-b border-border bg-surface-2/40">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div
            key={d}
            className="px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wide text-muted"
          >
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {weeks.flat().map((key) => {
          const date = new Date(`${key}T12:00:00Z`);
          const outside = date.getUTCMonth() !== monthIndex;
          const isToday = key === todayKey;
          const day = byDay.get(key) ?? [];
          const timed = day.filter((e) => !e.all_day);

          return (
            <Link
              key={key}
              href={`/diary?view=day&day=${key}`}
              className={`min-h-[6.5rem] border-b border-r border-cal-grid p-1.5 transition-colors last:border-r-0 hover:bg-surface-2/50 ${
                outside ? "bg-surface-2/20" : ""
              }`}
            >
              <div className="flex items-baseline justify-between">
                <span
                  className={`grid size-6 place-items-center rounded-full text-xs tabular-nums ${
                    isToday
                      ? "bg-accent font-semibold text-on-accent"
                      : outside
                        ? "text-muted/60"
                        : "font-medium text-foreground"
                  }`}
                >
                  {date.getUTCDate()}
                </span>

                {/* How busy, before you read a word of it. */}
                {timed.length > 0 && (
                  <span className="text-[10px] tabular-nums text-muted">{timed.length}</span>
                )}
              </div>

              <div className="mt-1 space-y-0.5">
                {day.slice(0, SHOWN_PER_DAY).map((entry) => {
                  const hue = hueFor(colourBy, entry, `var(--cal-${entry.category ?? "client"})`);
                  return (
                    <div
                      key={entry.id}
                      className="truncate rounded px-1 py-0.5 text-[10px] leading-tight"
                      style={{
                        background: `color-mix(in srgb, ${hue} 14%, var(--surface))`,
                        borderLeft: `2px solid ${hue}`,
                      }}
                      title={entry.clientName ?? entry.title ?? "Booked"}
                    >
                      {entry.all_day
                        ? entry.title ?? "All day"
                        : `${shortTime(entry.starts_at, timezone)} ${
                            entry.clientName ?? entry.title ?? "Booked"
                          }`}
                    </div>
                  );
                })}

                {day.length > SHOWN_PER_DAY && (
                  <div className="px-1 text-[10px] text-muted">
                    {day.length - SHOWN_PER_DAY} more
                  </div>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/** The date a moment falls on, in the business's timezone rather than the server's. */
function dayKey(iso: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
  return parts;
}

/** "9am", "2:30pm" — short enough to sit in a cell this size. */
function shortTime(iso: string, timezone: string): string {
  return new Date(iso)
    .toLocaleTimeString("en-GB", {
      timeZone: timezone,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
    .replace(":00", "")
    .replace(" ", "");
}
