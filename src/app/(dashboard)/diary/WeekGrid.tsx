"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { categoryFor, addDays, isoDate } from "@/lib/calendar";
import { EntryDialog } from "./EntryDialog";
import { moveDiaryEntry } from "./actions";
import { zonedToUtc as toUtc } from "@/lib/booking/tz";
import { useDrag, clockOf, lengthOf, SNAP_MINUTES } from "./useDrag";
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
  /** What the enquiry was quoted, for the week's worth. */
  quotePence: number | null;
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
    /** Set when the slot was dragged out rather than clicked. */
    endTime?: string;
    artistId?: string;
  } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [nowMinutes, setNowMinutes] = useState<number | null>(null);
  const [moveError, setMoveError] = useState("");
  const [, startMove] = useTransition();

  // Where each column sits on screen, so a drag knows which one it is over.
  const columnBoxes = useRef(new Map<string, HTMLDivElement>());

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

  /*
   * Open somewhere useful rather than at midnight.
   *
   * Math.min of an empty list is Infinity, so a business that has not set its
   * hours yet — every business on its first day — got a diary scrolled to one
   * in the morning. Seven is the fallback, and it never scrolls past nine.
   */
  useLayoutEffect(() => {
    const openings = hours
      .filter((h) => !h.closed)
      .map((h) => Number(h.open.split(":")[0]))
      .filter((n) => Number.isFinite(n));

    const earliest = openings.length ? Math.min(...openings) : 8;
    const target = Math.min(Math.max(0, earliest - 1), 9);

    if (scroller.current) scroller.current.scrollTop = target * HOUR_HEIGHT;
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

  /** "2026-09-01" plus wall-clock minutes, in the business's timezone. */
  const zonedToUtc = (date: string, minutes: number, tz: string) => {
    const [y, m, d] = date.split("-").map(Number);
    return toUtc(y, m, d, minutes, tz).toISOString();
  };

  const hhmm = (minutes: number) =>
    `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

  /** Which column a page x-coordinate is over. */
  const columnKeyAt = useCallback((clientX: number) => {
    for (const [key, el] of columnBoxes.current) {
      const box = el.getBoundingClientRect();
      if (clientX >= box.left && clientX <= box.right) return key;
    }
    return null;
  }, []);

  /*
   * Committing a drag.
   *
   * The times coming back are wall-clock minutes in the business's timezone,
   * which is not the browser's — so they go back through the same conversion
   * the forms use rather than being treated as local. Getting this wrong would
   * move every dragged appointment an hour through British Summer Time.
   */
  const commit = useCallback(
    (drag: { kind: string; id?: string; startMinutes: number; endMinutes: number; columnKey: string }) => {
      const column = columns.find((c) => c.key === drag.columnKey);
      if (!column) return;

      if (drag.kind === "create") {
        setCreating({
          date: column.date,
          time: hhmm(drag.startMinutes),
          endTime: hhmm(drag.endMinutes),
          artistId: column.artist?.id,
        });
        return;
      }

      const entry = entries.find((e) => e.id === drag.id);
      if (!entry) return;

      const startsAt = zonedToUtc(column.date, drag.startMinutes, timezone);
      const endsAt = zonedToUtc(column.date, drag.endMinutes, timezone);

      // Nothing actually changed — a nudge that landed back where it started.
      if (
        startsAt === entry.starts_at &&
        endsAt === entry.ends_at &&
        (!column.artist || column.artist.id === entry.artist_id)
      ) {
        return;
      }

      setMoveError("");
      startMove(async () => {
        const result = await moveDiaryEntry({
          id: entry.id,
          startsAt,
          endsAt,
          artistId: column.artist?.id,
        });
        if (result.error) setMoveError(result.error);
      });
    },
    [columns, entries, timezone],
  );

  const { drag, begin } = useDrag({ hourHeight: HOUR_HEIGHT, columnKeyAt, onCommit: commit });

  return (
    <>
      {/*
       * A move can be refused — the database will not allow two things in the
       * same slot. Without this the entry silently springs back and it looks
       * like the drag did not work.
       */}
      {moveError && (
        <div
          role="alert"
          className="fixed inset-x-4 bottom-24 z-50 mx-auto w-fit max-w-sm rounded-xl border border-warn/40 bg-surface px-4 py-3 text-sm shadow-[var(--shadow-pop)] md:bottom-6"
        >
          <div className="flex items-start gap-3">
            <span className="text-warn">{moveError}</span>
            <button
              type="button"
              onClick={() => setMoveError("")}
              className="shrink-0 text-muted hover:text-foreground"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        {/* ------------------------------------------------ headings */}
        <div className="sticky top-0 z-20 flex border-b border-border bg-surface/95 backdrop-blur">
          <div className="w-16 shrink-0 border-r border-border" />
          {columns.map((col) => {
            const isToday = view === "week" && col.date === todayKey;
            const weekday = new Date(col.date).getDay();
            const closed = view === "week" && hours.find((h) => h.day === weekday)?.closed;

            return (
              <div
                key={col.key}
                className={`flex-1 border-r border-border px-2 py-2.5 text-center last:border-r-0 ${
                  // Weekends sit back a little, so the working week reads first.
                  view === "week" && (weekday === 0 || weekday === 6)
                    ? "bg-surface-2/40"
                    : ""
                }`}
              >
                {col.artist ? (
                  <div className="flex items-center justify-center gap-2">
                    <Avatar person={col.artist} size="sm" />
                    <span className="truncate text-sm font-medium">{col.label}</span>
                  </div>
                ) : (
                  <div
                    className={`text-[10px] font-semibold uppercase tracking-[0.09em] ${
                      isToday ? "text-accent" : "text-muted"
                    }`}
                  >
                    {col.label}
                  </div>
                )}
                {col.sub && (
                  <div
                    className={`mt-1 inline-grid size-7 place-items-center rounded-full font-display text-sm font-semibold tabular-nums transition-colors ${
                      isToday
                        ? "bg-accent text-white"
                        : closed
                          ? "text-muted"
                          : "text-foreground"
                    }`}
                  >
                    {col.sub}
                  </div>
                )}
                {closed && (
                  <div className="text-[10px] uppercase tracking-wide text-muted/70">
                    closed
                  </div>
                )}
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
                  {/* Sitting on the line rather than under it, so the eye
                      matches a time to the rule it belongs to. */}
                  <span className="num absolute -top-2 right-2.5 text-[10px] text-muted">
                    {h === 0 ? "" : `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "am" : "pm"}`}
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
                  ref={(el) => {
                    if (el) columnBoxes.current.set(col.key, el);
                    else columnBoxes.current.delete(col.key);
                  }}
                  onPointerDown={(event) => {
                    const box = event.currentTarget.getBoundingClientRect();
                    const at =
                      Math.round(
                        (((event.clientY - box.top) / HOUR_HEIGHT) * 60) / SNAP_MINUTES,
                      ) * SNAP_MINUTES;
                    begin(event, {
                      kind: "create",
                      startMinutes: at,
                      endMinutes: at + 60,
                      columnKey: col.key,
                    });
                  }}
                  onClick={(event) => {
                    // A plain click still adds an hour here; the drag only
                    // takes over once the pointer has actually moved.
                    if (drag) return;
                    const box = event.currentTarget.getBoundingClientRect();
                    const at =
                      Math.round(
                        (((event.clientY - box.top) / HOUR_HEIGHT) * 60) / SNAP_MINUTES,
                      ) * SNAP_MINUTES;
                    setCreating({
                      date: col.date,
                      time: hhmm(at),
                      artistId: col.artist?.id,
                    });
                  }}
                  className={`relative flex-1 cursor-copy touch-none border-r border-border last:border-r-0 ${
                    isToday
                      ? "bg-accent/[0.045]"
                      : view === "week" &&
                          (new Date(col.date).getDay() === 0 || new Date(col.date).getDay() === 6)
                        ? "bg-surface-2/25"
                        : ""
                  }`}
                  style={{ height: 24 * HOUR_HEIGHT }}
                  title="Click to add an hour, or drag out the time you want"
                >
                  {/* The hour is a line; the half hour is a whisper. Any more
                      and the grid competes with what is written on it. */}
                  {hourList.map((h) => (
                    <div key={h} style={{ height: HOUR_HEIGHT }} className="relative">
                      <div className="absolute inset-x-0 top-0 border-t border-cal-grid" />
                      <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-cal-grid/50" />
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
                      className="pointer-events-none absolute inset-x-0 z-10"
                      style={{ top: (nowMinutes / 60) * HOUR_HEIGHT }}
                    >
                      <div className="border-t-2 border-[var(--highlight)]" />
                      <span className="absolute -left-1.5 -top-[5px] size-2.5 rounded-full bg-[var(--highlight)] ring-2 ring-surface" />
                    </div>
                  )}

                  {laid.map(({ entry: e, top, height, left, width }) => {
                    const cat = categoryFor(e.category);
                    const artist = artists.find((a) => a.id === e.artist_id);
                    const unpaid =
                      e.source === "assistant" && e.deposit_status !== "paid";
                    const dragging = drag?.id === e.id;
                    const startMinutes = minutesInDay(e.starts_at, timezone);
                    const endMinutes =
                      startMinutes +
                      (Date.parse(e.ends_at) - Date.parse(e.starts_at)) / 60000;

                    return (
                      <div
                        key={e.id}
                        onPointerDown={(event) =>
                          begin(event, {
                            kind: "move",
                            id: e.id,
                            startMinutes,
                            endMinutes,
                            columnKey: col.key,
                          })
                        }
                        onClick={(event) => {
                          event.stopPropagation();
                          // A drag that moved is not a click to open.
                          if (drag) return;
                          setEditing(e);
                        }}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setEditing(e);
                          }
                        }}
                        className={`group absolute touch-none overflow-hidden rounded-lg px-2 py-1 text-left text-[11px] leading-tight transition-[box-shadow,opacity] hover:z-20 hover:shadow-[var(--shadow-pop)] focus-visible:z-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                          dragging ? "opacity-30" : "cursor-grab active:cursor-grabbing"
                        }`}
                        style={{
                          top,
                          height,
                          left: `calc(${left}% + 2px)`,
                          width: `calc(${width}% - 4px)`,
                          background: `color-mix(in srgb, ${cat.hue} ${e.blocks_availability ? 16 : 9}%, var(--surface))`,
                          boxShadow: `inset 4px 0 0 ${unpaid ? "var(--warn)" : cat.hue}, var(--shadow-card)`,
                          color: "var(--foreground)",
                          border: `1px solid color-mix(in srgb, ${cat.hue} 28%, var(--border))`,
                        }}
                      >
                        <div className="flex items-center gap-1 truncate text-[11.5px] font-semibold">
                          {unpaid && (
                            <span
                              className="size-1.5 shrink-0 rounded-full bg-warn"
                              title="Waiting on a deposit"
                            />
                          )}
                          <span className="truncate">
                            {e.title ?? e.clientName ?? cat.label}
                          </span>
                        </div>
                        {height > 32 && (
                          <div className="num truncate text-[10px] text-muted">
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

                        {/* Pull the bottom edge to change how long it runs.
                            Invisible until hovered, so it does not clutter a
                            full week, but always eight pixels of target. */}
                        <span
                          onPointerDown={(event) =>
                            begin(event, {
                              kind: "resize",
                              id: e.id,
                              startMinutes,
                              endMinutes,
                              columnKey: col.key,
                            })
                          }
                          className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize opacity-0 transition-opacity group-hover:opacity-100"
                          style={{ background: `color-mix(in srgb, ${cat.hue} 45%, transparent)` }}
                          aria-hidden
                        />
                      </div>
                    );
                  })}

                  {/* Where it will land. Follows the pointer, shows the times
                      it is snapping to, and is the only thing on screen that
                      says what releasing will do. */}
                  {drag && drag.columnKey === col.key && (
                    <div
                      className="pointer-events-none absolute inset-x-1 z-30 rounded-lg border-2 border-dashed px-2 py-1 text-[11px] font-medium"
                      style={{
                        top: (drag.startMinutes / 60) * HOUR_HEIGHT,
                        height: Math.max(
                          20,
                          ((drag.endMinutes - drag.startMinutes) / 60) * HOUR_HEIGHT,
                        ),
                        borderColor: "var(--accent)",
                        background: "color-mix(in srgb, var(--accent) 14%, var(--surface))",
                        color: "var(--foreground)",
                      }}
                    >
                      <div className="truncate">
                        {clockOf(drag.startMinutes)} – {clockOf(drag.endMinutes)}
                      </div>
                      <div className="truncate text-muted">
                        {lengthOf(drag.endMinutes - drag.startMinutes)}
                      </div>
                    </div>
                  )}
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
