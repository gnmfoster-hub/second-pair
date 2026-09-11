"use client";

import { useMemo, useState } from "react";
import { EntryDialog } from "./EntryDialog";
import type { Entry } from "./WeekGrid";
import type { Artist } from "@/lib/types";
import { categoryFor } from "@/lib/calendar";
import { hueFor, type ColourMode } from "@/lib/diaryColour";

/**
 * The day as a list, for a phone.
 *
 * A column per person is a desktop idea. Measured on a 390px screen, the grid
 * gave you four and three quarter hours of your day, only two of three people,
 * a sideways scroll to reach the third, and all of that inside a vertical
 * scroll inside a scrolling page. Three scroll regions and a fifth of the day.
 *
 * A list has none of those problems and answers the question a phone is
 * actually asked — what am I doing next — in the first inch of the screen.
 * Everything in time order, gaps included, so an hour free reads as plainly as
 * an hour booked. The grid is still there on anything wider, where comparing
 * columns is possible and useful.
 *
 * The same dialog opens from a row as from a card, so there is one way to edit
 * an appointment and it cannot drift.
 */

const HOUR = 60 * 60_000;

/** "9:30 am". The business's own clock, not the phone's. */
function clockOf(iso: string, timezone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

/** "2027-03-11" where the business is, which is not where the server is. */
function dayOf(iso: string, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

/** "1h 30m", "45m" — how a person says a length. */
function lengthOf(ms: number) {
  const mins = Math.round(ms / 60_000);
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  if (!hours) return `${rest}m`;
  if (!rest) return `${hours}h`;
  return `${hours}h ${rest}m`;
}

function pence(amount: number | null) {
  if (!amount) return null;
  return amount % 100 === 0 ? `£${amount / 100}` : `£${(amount / 100).toFixed(2)}`;
}

type Row =
  | { kind: "entry"; entry: Entry }
  | { kind: "gap"; from: Date; to: Date };

export function DayList({
  entries,
  artists,
  timezone,
  date,
  colourBy,
  nowIso,
}: {
  entries: Entry[];
  artists: Artist[];
  timezone: string;
  /** The day being shown, as YYYY-MM-DD, for adding into a gap. */
  date: string;
  colourBy: ColourMode;
  /** Stamped on the server, so the first paint matches and nothing flickers. */
  nowIso: string;
}) {
  /*
   * The same colour the grid would give it.
   *
   * Worked out here rather than handed in, because the page rendering both is
   * a server component and cannot pass a function — and because two copies of
   * this rule would drift, leaving one appointment one colour on a phone and
   * another on a laptop.
   */
  const colourFor = (e: Entry) =>
    hueFor(
      colourBy,
      { clientName: e.clientName, artistName: artists.find((a) => a.id === e.artist_id)?.name },
      categoryFor(e.category).hue,
    );

  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState<{ time: string; endTime?: string } | null>(null);

  const rows = useMemo<Row[]>(() => {
    /*
     * This day only.
     *
     * The diary deliberately fetches a day either side, so that a holiday
     * which began last week still appears. The grid places every entry by its
     * date and the extras land outside the visible column; a list has no
     * columns, so it showed all three days at once — Thursday, Friday and
     * Saturday in one column with a sixteen-hour "free" gap between them,
     * which is overnight presented as an opportunity.
     *
     * Compared as dates in the business's own timezone, and by overlap rather
     * than by start, so something running from yesterday into today is still
     * today's problem. Plain string comparison is safe on YYYY-MM-DD.
     */
    const sorted = entries
      .filter((e) => !e.all_day)
      .filter(
        (e) => dayOf(e.starts_at, timezone) <= date && dayOf(e.ends_at, timezone) >= date,
      )
      .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));

    const out: Row[] = [];

    for (let i = 0; i < sorted.length; i++) {
      out.push({ kind: "entry", entry: sorted[i] });

      /*
       * A gap is only worth showing if somebody could sell it.
       *
       * Ten minutes between two appointments is how a day is supposed to look,
       * and a row announcing it is noise on every line. Half an hour is the
       * shortest thing most of these businesses will book.
       *
       * Measured against the latest end so far, not the previous row's:
       * appointments overlap constantly in a salon — three people working at
       * once — and comparing with the one immediately before would invent gaps
       * that do not exist.
       */
      const latestEnd = sorted
        .slice(0, i + 1)
        .reduce((furthest, e) => Math.max(furthest, Date.parse(e.ends_at)), 0);

      const next = sorted[i + 1];
      if (!next) continue;

      const gap = Date.parse(next.starts_at) - latestEnd;
      if (gap >= 30 * 60_000) {
        out.push({ kind: "gap", from: new Date(latestEnd), to: new Date(next.starts_at) });
      }
    }

    return out;
    // date and timezone decide what is in the list, so both belong here.
  }, [entries, date, timezone]);

  const allDay = entries.filter(
    (e) =>
      e.all_day &&
      dayOf(e.starts_at, timezone) <= date &&
      dayOf(e.ends_at, timezone) >= date,
  );
  const open = editingId ? entries.find((e) => e.id === editingId) ?? null : null;
  const now = Date.parse(nowIso);

  const nameOf = (id: string) => artists.find((a) => a.id === id)?.name ?? "";

  return (
    <>
      {allDay.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {allDay.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => setEditingId(e.id)}
              className="flex w-full items-center gap-2.5 rounded-xl border border-border px-3.5 py-2.5 text-left"
              style={{ borderLeft: `3px solid ${colourFor(e)}` }}
            >
              <span className="text-sm font-medium">{e.title || "All day"}</span>
              <span className="hint ml-auto">{nameOf(e.artist_id)}</span>
            </button>
          ))}
        </div>
      )}

      <ol className="mt-3 space-y-1.5 pb-24">
        {rows.map((row) => {
          if (row.kind === "gap") {
            const from = row.from.toISOString();
            return (
              <li key={`gap-${from}`}>
                {/*
                  * Free time is a thing you can act on, so it is a button.
                  *
                  * Dashed and quiet, because most of the day's rows are
                  * appointments and a gap should not compete with them — but
                  * tapping it starts an entry already filled in with the time,
                  * which is the whole reason somebody looks at a gap.
                  */}
                <button
                  type="button"
                  onClick={() =>
                    setCreating({
                      time: clock24(from, timezone),
                      endTime: clock24(row.to.toISOString(), timezone),
                    })
                  }
                  className="flex min-h-11 w-full items-center gap-3 rounded-xl border border-dashed border-border px-3.5 py-2 text-left text-xs text-muted transition-colors hover:border-solid hover:text-foreground"
                >
                  <span className="tabular-nums">{clockOf(from, timezone)}</span>
                  <span className="h-px flex-1 bg-border" aria-hidden />
                  <span>{lengthOf(row.to.getTime() - row.from.getTime())} free</span>
                  <span aria-hidden>+</span>
                </button>
              </li>
            );
          }

          const e = row.entry;
          const starts = Date.parse(e.starts_at);
          const ends = Date.parse(e.ends_at);
          const past = ends < now;
          const running = starts <= now && ends > now;
          const cost = pence(e.price_pence ?? null);

          return (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => setEditingId(e.id)}
                className={`flex w-full gap-3 rounded-xl border border-border bg-surface px-3.5 py-3 text-left transition-colors ${
                  past ? "opacity-55" : ""
                } ${running ? "ring-2 ring-accent/40" : ""}`}
                style={{ borderLeft: `3px solid ${colourFor(e)}` }}
              >
                {/*
                  * The time in its own column, right-aligned and tabular.
                  *
                  * It is what the list is scanned by, so every row's start sits
                  * on the same edge and the digits line up — the difference
                  * between reading a column and reading thirty separate labels.
                  */}
                {/*
                  * Wide enough for "12:30 pm" and not a pixel more.
                  *
                  * It was 70px against text that measures about 48, and being
                  * right-aligned the difference sat on the left as a permanent
                  * empty gutter down the side of every row — which reads as a
                  * column that failed to load rather than as spacing.
                  */}
                <span className="w-[3.5rem] shrink-0 pt-px text-right">
                  <span className="block text-sm font-semibold tabular-nums tracking-tight">
                    {clockOf(e.starts_at, timezone)}
                  </span>
                  <span className="hint block text-[0.7rem] tabular-nums">
                    {lengthOf(ends - starts)}
                  </span>
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {e.clientName || e.title || "Appointment"}
                  </span>
                  {(e.title || e.description) && e.clientName && (
                    <span className="hint mt-0.5 block truncate">
                      {e.title || e.description}
                    </span>
                  )}
                  <span className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    {artists.length > 1 && (
                      <span className="hint inline-flex items-center gap-1.5">
                        {colourBy === "person" && (
                          <span
                            className="size-2 shrink-0 rounded-full"
                            style={{ background: colourFor(e) }}
                            aria-hidden
                          />
                        )}
                        {nameOf(e.artist_id)}
                      </span>
                    )}
                    {cost && <span className="hint tabular-nums">{cost}</span>}
                    {e.source === "assistant" && (
                      <span className="pill bg-accent/10 text-[0.62rem] text-accent">
                        Booked for you
                      </span>
                    )}
                    {e.deposit_status === "paid" && (
                      <span className="pill bg-ok/10 text-[0.62rem] text-ok">Deposit paid</span>
                    )}
                  </span>
                </span>
              </button>
            </li>
          );
        })}

        {rows.length === 0 && allDay.length === 0 && (
          <li className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
            <p className="text-sm font-medium">Nothing booked today</p>
            <p className="hint mt-1">A clear day. Tap Add to put something in it.</p>
          </li>
        )}
      </ol>

      {(open || creating) && (
        <EntryDialog
          entry={open}
          prefill={creating ? { date, ...creating } : null}
          artists={artists}
          timezone={timezone}
          onClose={() => {
            setEditingId(null);
            setCreating(null);
          }}
        />
      )}
    </>
  );
}

/** "14:30", which is what the time input in the dialog wants. */
function clock24(iso: string, timezone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export { HOUR };
