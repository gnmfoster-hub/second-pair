"use client";

import { useMemo, useRef, useState } from "react";
import { categoryFor, addDays, isoDate } from "@/lib/calendar";
import { EntryDialog } from "./EntryDialog";
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
};

const HOUR_HEIGHT = 52;

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

export function WeekGrid({
  weekStart,
  entries,
  artists,
  hours,
  timezone,
}: {
  weekStart: string;
  entries: Entry[];
  artists: Artist[];
  hours: OpeningHours[];
  timezone: string;
}) {
  const [editing, setEditing] = useState<Entry | null>(null);
  const [creating, setCreating] = useState<{ date: string; time: string } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const start = useMemo(() => {
    const [y, m, d] = weekStart.split("-").map(Number);
    return new Date(y, m - 1, d);
  }, [weekStart]);

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(start, i)),
    [start],
  );

  // Show an hour before opening and an hour after closing, so early and late
  // entries are reachable without the grid running 00:00–24:00.
  const open = hours.filter((h) => !h.closed);
  const earliest = Math.min(
    ...open.map((h) => Number(h.open.split(":")[0])),
    9,
  );
  const latest = Math.max(
    ...open.map((h) => Number(h.close.split(":")[0])),
    18,
  );
  const fromHour = Math.max(0, earliest - 1);
  const toHour = Math.min(24, latest + 1);
  const hourList = Array.from({ length: toHour - fromHour }, (_, i) => fromHour + i);

  const todayKey = isoDate(new Date());

  const timed = entries.filter((e) => !e.all_day);
  const allDay = entries.filter((e) => e.all_day);

  function slotFromClick(event: React.MouseEvent<HTMLDivElement>, date: Date) {
    const box = event.currentTarget.getBoundingClientRect();
    const y = event.clientY - box.top;
    const rawMinutes = fromHour * 60 + (y / HOUR_HEIGHT) * 60;
    const snapped = Math.max(0, Math.round(rawMinutes / 15) * 15);
    const h = String(Math.floor(snapped / 60)).padStart(2, "0");
    const m = String(snapped % 60).padStart(2, "0");
    setCreating({ date: isoDate(date), time: `${h}:${m}` });
  }

  return (
    <>
      <div className="card overflow-hidden">
        {/* ------------------------------------------------ day headings */}
        <div className="flex border-b border-border">
          <div className="w-14 shrink-0 border-r border-border" />
          {days.map((day) => {
            const key = isoDate(day);
            const isToday = key === todayKey;
            const closed = hours.find((h) => h.day === day.getDay())?.closed;
            return (
              <div
                key={key}
                className={`flex-1 border-r border-border px-2 py-2 text-center last:border-r-0 ${
                  isToday ? "bg-accent/10" : ""
                }`}
              >
                <div className="text-[11px] uppercase tracking-wide text-muted">
                  {day.toLocaleDateString("en-GB", { weekday: "short" })}
                </div>
                <div
                  className={`text-sm tabular-nums ${isToday ? "font-semibold text-accent" : ""}`}
                >
                  {day.getDate()}
                </div>
                {closed && <div className="text-[10px] text-muted">closed</div>}
              </div>
            );
          })}
        </div>

        {/* ------------------------------------------------ all-day band */}
        {allDay.length > 0 && (
          <div className="flex border-b border-border bg-surface-2/40">
            <div className="w-14 shrink-0 border-r border-border px-2 py-1 text-[10px] uppercase tracking-wide text-muted">
              All day
            </div>
            {days.map((day) => {
              const key = isoDate(day);
              const here = allDay.filter((e) => {
                const from = dayKey(e.starts_at, timezone);
                const to = dayKey(
                  new Date(Date.parse(e.ends_at) - 1).toISOString(),
                  timezone,
                );
                return key >= from && key <= to;
              });
              return (
                <div key={key} className="flex-1 space-y-1 border-r border-border p-1 last:border-r-0">
                  {here.map((e) => {
                    const cat = categoryFor(e.category);
                    return (
                      <button
                        key={e.id}
                        type="button"
                        onClick={() => setEditing(e)}
                        className="block w-full truncate rounded px-1.5 py-1 text-left text-[11px] text-white"
                        style={{ background: cat.hue }}
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
        <div ref={scroller} className="max-h-[62vh] overflow-y-auto">
          <div className="flex">
            <div className="w-14 shrink-0 border-r border-border">
              {hourList.map((h) => (
                <div
                  key={h}
                  style={{ height: HOUR_HEIGHT }}
                  className="relative border-b border-cal-grid"
                >
                  <span className="absolute -top-2 right-1.5 text-[10px] tabular-nums text-muted">
                    {h.toString().padStart(2, "0")}:00
                  </span>
                </div>
              ))}
            </div>

            {days.map((day) => {
              const key = isoDate(day);
              const opening = hours.find((h) => h.day === day.getDay());
              const here = timed.filter((e) => dayKey(e.starts_at, timezone) === key);

              return (
                <div
                  key={key}
                  onClick={(e) => slotFromClick(e, day)}
                  className="relative flex-1 cursor-copy border-r border-border last:border-r-0"
                  style={{ height: hourList.length * HOUR_HEIGHT }}
                  title="Click to add something here"
                >
                  {/* hour lines */}
                  {hourList.map((h) => (
                    <div
                      key={h}
                      style={{ height: HOUR_HEIGHT }}
                      className="border-b border-cal-grid"
                    />
                  ))}

                  {/* shade the hours the studio is shut */}
                  {opening && !opening.closed && (
                    <>
                      <div
                        className="pointer-events-none absolute inset-x-0 top-0 bg-background/45"
                        style={{
                          height:
                            ((Number(opening.open.split(":")[0]) * 60 +
                              Number(opening.open.split(":")[1]) -
                              fromHour * 60) /
                              60) *
                            HOUR_HEIGHT,
                        }}
                      />
                      <div
                        className="pointer-events-none absolute inset-x-0 bottom-0 bg-background/45"
                        style={{
                          height:
                            ((toHour * 60 -
                              (Number(opening.close.split(":")[0]) * 60 +
                                Number(opening.close.split(":")[1]))) /
                              60) *
                            HOUR_HEIGHT,
                        }}
                      />
                    </>
                  )}
                  {opening?.closed && (
                    <div className="pointer-events-none absolute inset-0 bg-background/45" />
                  )}

                  {/* entries */}
                  {here.map((e) => {
                    const cat = categoryFor(e.category);
                    const startMin = minutesInDay(e.starts_at, timezone);
                    const length = Math.max(
                      20,
                      (Date.parse(e.ends_at) - Date.parse(e.starts_at)) / 60000,
                    );
                    const top = ((startMin - fromHour * 60) / 60) * HOUR_HEIGHT;
                    const height = (length / 60) * HOUR_HEIGHT;
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
                        className="absolute inset-x-1 overflow-hidden rounded px-1.5 py-1 text-left text-[11px] leading-tight text-white"
                        style={{
                          top,
                          height,
                          background: cat.hue,
                          opacity: e.blocks_availability ? 1 : 0.72,
                          borderLeft: unpaid ? "3px solid var(--warn)" : undefined,
                        }}
                      >
                        <div className="truncate font-medium">
                          {e.title ?? e.clientName ?? cat.label}
                        </div>
                        {height > 34 && (
                          <div className="truncate opacity-85">
                            {new Intl.DateTimeFormat("en-GB", {
                              timeZone: timezone,
                              hour: "numeric",
                              minute: "2-digit",
                              hour12: true,
                            }).format(new Date(e.starts_at))}
                            {artists.length > 1 && artist ? ` · ${artist.name}` : ""}
                          </div>
                        )}
                        {height > 56 && e.description && (
                          <div className="truncate opacity-75">{e.description}</div>
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
