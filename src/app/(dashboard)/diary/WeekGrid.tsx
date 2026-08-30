"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { categoryFor, addDays, isoDate } from "@/lib/calendar";
import { EntryDialog } from "./EntryDialog";
import { Avatar } from "@/components/Avatar";
import type { Artist, OpeningHours } from "@/lib/types";

export type Entry = {
  id: string;
  artist_id: string;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  category: string;
  blocks_availability: boolean;
  source: "assistant" | "manual" | "block";
  title: string | null;
  notes: string | null;
  deposit_status: string;
  deposit_amount_pence: number;
  clientName: string | null;
  clientPhone: string | null;
  description: string | null;
  conversationId: string | null;
  repeats: string;
};

const HOUR_HEIGHT = 60;

/** Local wall-clock minutes since midnight, in the studio's timezone. */
function minutesInDay(iso: string, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const at = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return (Number(at.hour) % 24) * 60 + Number(at.minute);
}

function dayKey(iso: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const at = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${at.year}-${at.month}-${at.day}`;
}

const clock = (iso: string, timezone: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));

/**
 * Side-by-side columns for entries that overlap, so a double-booked hour is
 * legible rather than one card hiding another.
 */
function layout(entries: Entry[], timezone: string) {
  const sorted = [...entries].sort(
    (a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at),
  );
  const columns: Entry[][] = [];

  for (const entry of sorted) {
    const start = Date.parse(entry.starts_at);
    const column = columns.find(
      (col) => Date.parse(col[col.length - 1].ends_at) <= start,
    );
    if (column) column.push(entry);
    else columns.push([entry]);
  }

  return sorted.map((entry) => {
    const index = columns.findIndex((col) => col.includes(entry));
    const overlapping = columns.filter((col) =>
      col.some(
        (other) =>
          Date.parse(other.starts_at) < Date.parse(entry.ends_at) &&
          Date.parse(other.ends_at) > Date.parse(entry.starts_at),
      ),
    ).length;
    return {
      entry,
      left: (index / Math.max(1, overlapping)) * 100,
      width: 100 / Math.max(1, overlapping),
      top: ((minutesInDay(entry.starts_at, timezone)) / 60) * HOUR_HEIGHT,
      height: Math.max(
        22,
        ((Date.parse(entry.ends_at) - Date.parse(entry.starts_at)) / 3600000) * HOUR_HEIGHT,
      ),
    };
  });
}

export function WeekGrid({
  weekStart,
  entries,
  artists,
  hours,
  timezone,
  view,
  day,
}: {
  weekStart: string;
  entries: Entry[];
  artists: Artist[];
  hours: OpeningHours[];
  timezone: string;
  view: "week" | "day";
  day: string;
}) {
  const [editing, setEditing] = useState<Entry | null>(null);
  const [creating, setCreating] = useState<{
    date: string;
    time: string;
    artistId?: string;
  } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [nowMinutes, setNowMinutes] = useState<number | null>(null);

  const start = useMemo(() => {
    const [y, m, d] = weekStart.split("-").map(Number);
    return new Date(y, m - 1, d);
  }, [weekStart]);

  // Columns are days in week view, people in day view — the two things you
  // actually want to compare.
  const columns = useMemo(() => {
    if (view === "day") {
      return artists.map((a) => ({ key: a.id, label: a.name, sub: "", date: day, artist: a }));
    }
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(start, i);
      return {
        key: isoDate(d),
        label: d.toLocaleDateString("en-GB", { weekday: "short" }),
        sub: String(d.getDate()),
        date: isoDate(d),
        artist: undefined,
      };
    });
  }, [view, artists, day, start]);

  const todayKey = isoDate(new Date());

  // A live line across today, the thing that makes a calendar feel alive.
  useEffect(() => {
    const tick = () => {
      const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: timezone,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).formatToParts(new Date());
      const at = Object.fromEntries(parts.map((p) => [p.type, p.value]));
      setNowMinutes((Number(at.hour) % 24) * 60 + Number(at.minute));
    };
    tick();
    const timer = setInterval(tick, 60_000);
    return () => clearInterval(timer);
  }, [timezone]);

  // Open somewhere useful rather than at midnight.
  useLayoutEffect(() => {
    const opens = Math.min(
      ...hours.filter((h) => !h.closed).map((h) => Number(h.open.split(":")[0])),
    );
    if (scroller.current) {
      scroller.current.scrollTop = Math.max(0, (opens - 1) * HOUR_HEIGHT);
    }
  }, [hours]);

  const timed = entries.filter((e) => !e.all_day);
  const allDay = entries.filter((e) => e.all_day);
  const hourList = Array.from({ length: 24 }, (_, i) => i);

  function entriesFor(column: (typeof columns)[number]) {
    return timed.filter((e) => {
      if (dayKey(e.starts_at, timezone) !== column.date) return false;
      return column.artist ? e.artist_id === column.artist.id : true;
    });
  }

  function slotFromClick(event: React.MouseEvent<HTMLDivElement>, column: (typeof columns)[number]) {
    const box = event.currentTarget.getBoundingClientRect();
    const minutes = Math.max(
      0,
      Math.round(((event.clientY - box.top) / HOUR_HEIGHT) * 60 / 15) * 15,
    );
    setCreating({
      date: column.date,
      time: `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`,
      artistId: column.artist?.id,
    });
  }

  return (
    <>
      <div className="card overflow-hidden">
        {/* ------------------------------------------------ headings */}
        <div className="flex border-b border-border bg-surface">
          <div className="w-16 shrink-0 border-r border-border" />
          {columns.map((col) => {
            const isToday = view === "week" && col.date === todayKey;
            const closed =
              view === "week" &&
              hours.find((h) => h.day === new Date(col.date).getDay())?.closed;
            return (
              <div
                key={col.key}
                className={`flex-1 border-r border-border px-2 py-2.5 text-center last:border-r-0 ${
                  isToday ? "bg-accent/8" : ""
                }`}
              >
                {col.artist ? (
                  <div className="flex items-center justify-center gap-2">
                    <Avatar person={col.artist} size="sm" />
                    <span className="text-sm">{col.label}</span>
                  </div>
                ) : (
                  <div className="text-[11px] uppercase tracking-wide text-muted">
                    {col.label}
                  </div>
                )}
                {col.sub && (
                  <div
                    className={`mt-0.5 inline-grid size-7 place-items-center rounded-full text-sm tabular-nums ${
                      isToday ? "bg-accent font-semibold text-white" : ""
                    }`}
                  >
                    {col.sub}
                  </div>
                )}
                {closed && <div className="text-[10px] text-muted">closed</div>}
              </div>
            );
          })}
        </div>

        {/* ------------------------------------------------ all-day band */}
        {allDay.length > 0 && (
          <div className="flex border-b border-border bg-surface-2/40">
            <div className="w-16 shrink-0 border-r border-border px-2 py-1.5 text-[10px] uppercase tracking-wide text-muted">
              All day
            </div>
            {columns.map((col) => {
              const here = allDay.filter((e) => {
                if (col.artist && e.artist_id !== col.artist.id) return false;
                const from = dayKey(e.starts_at, timezone);
                const to = dayKey(new Date(Date.parse(e.ends_at) - 1).toISOString(), timezone);
                return col.date >= from && col.date <= to;
              });
              return (
                <div
                  key={col.key}
                  className="flex-1 space-y-1 border-r border-border p-1.5 last:border-r-0"
                >
                  {here.map((e) => {
                    const cat = categoryFor(e.category);
                    return (
                      <button
                        key={e.id}
                        type="button"
                        onClick={() => setEditing(e)}
                        className="block w-full truncate rounded-md px-2 py-1 text-left text-[11px] font-medium"
                        style={{
                          background: `color-mix(in srgb, ${cat.hue} 22%, transparent)`,
                          color: cat.hue,
                          boxShadow: `inset 2px 0 0 ${cat.hue}`,
                        }}
                      >
                        {e.title ?? cat.label}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}

        {/* ------------------------------------------------ time grid */}
        <div ref={scroller} className="max-h-[64vh] overflow-y-auto">
          <div className="flex">
            <div className="w-16 shrink-0 border-r border-border">
              {hourList.map((h) => (
                <div key={h} style={{ height: HOUR_HEIGHT }} className="relative">
                  <span className="absolute -top-1.5 right-2 text-[10px] tabular-nums text-muted">
                    {h === 0 ? "" : `${h.toString().padStart(2, "0")}:00`}
                  </span>
                </div>
              ))}
            </div>

            {columns.map((col) => {
              const opening = hours.find((h) => h.day === new Date(col.date).getDay());
              const laid = layout(entriesFor(col), timezone);
              const isToday = col.date === todayKey;

              return (
                <div
                  key={col.key}
                  onClick={(e) => slotFromClick(e, col)}
                  className="relative flex-1 cursor-copy border-r border-border last:border-r-0"
                  style={{ height: 24 * HOUR_HEIGHT }}
                  title="Click to add something here"
                >
                  {hourList.map((h) => (
                    <div key={h} style={{ height: HOUR_HEIGHT }} className="relative">
                      <div className="absolute inset-x-0 top-0 border-t border-cal-grid" />
                      <div className="absolute inset-x-0 top-1/2 border-t border-cal-grid/40" />
                    </div>
                  ))}

                  {/* closed hours recede */}
                  {opening && !opening.closed ? (
                    <>
                      <div
                        className="pointer-events-none absolute inset-x-0 top-0 bg-cal-closed"
                        style={{
                          height:
                            ((Number(opening.open.split(":")[0]) * 60 +
                              Number(opening.open.split(":")[1])) /
                              60) *
                            HOUR_HEIGHT,
                        }}
                      />
                      <div
                        className="pointer-events-none absolute inset-x-0 bottom-0 bg-cal-closed"
                        style={{
                          height:
                            ((1440 -
                              (Number(opening.close.split(":")[0]) * 60 +
                                Number(opening.close.split(":")[1]))) /
                              60) *
                            HOUR_HEIGHT,
                        }}
                      />
                    </>
                  ) : (
                    <div className="pointer-events-none absolute inset-0 bg-cal-closed" />
                  )}

                  {/* now */}
                  {isToday && nowMinutes != null && (
                    <div
                      className="pointer-events-none absolute inset-x-0 z-10 border-t border-accent"
                      style={{ top: (nowMinutes / 60) * HOUR_HEIGHT }}
                    >
                      <span className="absolute -left-1 -top-[3px] size-1.5 rounded-full bg-accent" />
                    </div>
                  )}

                  {laid.map(({ entry: e, top, height, left, width }) => {
                    const cat = categoryFor(e.category);
                    const artist = artists.find((a) => a.id === e.artist_id);
                    const unpaid =
                      e.source === "assistant" && e.deposit_status !== "paid";

                    return (
                      <button
                        key={e.id}
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setEditing(e);
                        }}
                        className="absolute overflow-hidden rounded-md px-2 py-1 text-left text-[11px] leading-tight transition-shadow hover:z-20 hover:shadow-lg"
                        style={{
                          top,
                          height,
                          left: `calc(${left}% + 2px)`,
                          width: `calc(${width}% - 4px)`,
                          background: `color-mix(in srgb, ${cat.hue} ${e.blocks_availability ? 20 : 12}%, var(--surface))`,
                          boxShadow: `inset 3px 0 0 ${unpaid ? "var(--warn)" : cat.hue}`,
                          color: "var(--foreground)",
                          border: `1px solid color-mix(in srgb, ${cat.hue} 35%, transparent)`,
                        }}
                      >
                        <div className="truncate font-medium">
                          {e.title ?? e.clientName ?? cat.label}
                        </div>
                        {height > 32 && (
                          <div className="truncate text-muted">
                            {clock(e.starts_at, timezone)}
                            {view === "week" && artists.length > 1 && artist
                              ? ` · ${artist.name}`
                              : ""}
                          </div>
                        )}
                        {height > 54 && (e.description || e.notes) && (
                          <div className="truncate text-muted">
                            {e.description ?? e.notes}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {(editing || creating) && (
        <EntryDialog
          entry={editing}
          prefill={creating}
          artists={artists}
          timezone={timezone}
          onClose={() => {
            setEditing(null);
            setCreating(null);
          }}
        />
      )}
    </>
  );
}
