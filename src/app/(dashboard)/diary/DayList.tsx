"use client";

import { useMemo, useState } from "react";
import { EntryDialog } from "./EntryDialog";
import type { Entry } from "./WeekGrid";
import type { Artist } from "@/lib/types";
import { categoryFor } from "@/lib/calendar";
import { hueFor, type ColourMode } from "@/lib/diaryColour";

/**
 * A day, or a week, as a list — for a phone.
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
 *
 * The week is the same thing with day headings through it. Measured on a real
 * business's phone, the week grid showed two days of seven at 360px and made
 * you scroll sideways for the rest — forty-three pixels a column, which is not
 * a week, it is a rumour of one. A list of seven days scrolls the way
 * everything else on a phone scrolls.
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

/**
 * The same time, split so the rail can be narrower.
 *
 * "11:00 am" set solid is 57px and forced a 64px column down every row. The
 * hour is what the eye is looking for and the am or pm only matters once it
 * has been found, so the suffix is set smaller — 33px and 15px rather than 57,
 * which buys back eight pixels on every row of the diary.
 */
function splitClock(iso: string, timezone: string): [string, string] {
  const whole = clockOf(iso, timezone);
  const cut = whole.search(/\s*[ap]m$/i);
  return cut < 0 ? [whole, ""] : [whole.slice(0, cut), whole.slice(cut).trim()];
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
  | { kind: "day"; date: string; label: string; count: number }
  | { kind: "entry"; entry: Entry }
  | { kind: "gap"; from: Date; to: Date };

export function DayList({
  entries,
  artists,
  timezone,
  days,
  colourBy,
  nowIso,
}: {
  entries: Entry[];
  artists: Artist[];
  timezone: string;
  /**
   * The days being shown, as YYYY-MM-DD. One for the day view, seven for the
   * week. Adding into a gap uses the day that gap belongs to.
   */
  days: string[];
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
  const [creating, setCreating] = useState<{
    date: string;
    time: string;
    endTime?: string;
  } | null>(null);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    const many = days.length > 1;

    for (const date of days) {
      /*
       * This day only.
       *
       * The diary deliberately fetches a day either side, so that a holiday
       * which began last week still appears. The grid places every entry by
       * its date and the extras land outside the visible column; a list has no
       * columns, so without this it showed three days at once with a
       * sixteen-hour "free" gap between them — overnight, presented as an
       * opportunity.
       *
       * By overlap rather than by start, so something running from yesterday
       * into today is still today's problem. Plain string comparison is safe
       * on YYYY-MM-DD.
       */
      const today = entries
        .filter((e) => !e.all_day)
        .filter(
          (e) => dayOf(e.starts_at, timezone) <= date && dayOf(e.ends_at, timezone) >= date,
        )
        .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));

      if (many) {
        out.push({
          kind: "day",
          date,
          label: new Intl.DateTimeFormat("en-GB", {
            timeZone: timezone,
            weekday: "long",
            day: "numeric",
            month: "short",
          }).format(new Date(`${date}T12:00:00Z`)),
          count: today.length,
        });
      }

      for (let i = 0; i < today.length; i++) {
        out.push({ kind: "entry", entry: today[i] });

        /*
         * A gap is only worth showing if somebody could sell it.
         *
         * Ten minutes between two appointments is how a day is supposed to
         * look, and a row announcing it is noise on every line. Half an hour is
         * the shortest thing most of these businesses will book.
         *
         * Measured against the latest end so far, not the previous row's:
         * appointments overlap constantly where several people work at once,
         * and comparing with the one immediately before would invent gaps that
         * do not exist.
         */
        const latestEnd = today
          .slice(0, i + 1)
          .reduce((furthest, e) => Math.max(furthest, Date.parse(e.ends_at)), 0);

        const next = today[i + 1];
        if (!next) continue;

        if (Date.parse(next.starts_at) - latestEnd >= 30 * 60_000) {
          out.push({ kind: "gap", from: new Date(latestEnd), to: new Date(next.starts_at) });
        }
      }
    }

    return out;
    // days and timezone decide what is in the list, so both belong here.
  }, [entries, days, timezone]);

  /*
   * A completely empty week says so once, not eight times.
   *
   * Seven headings each reading "nothing booked" above a panel saying nothing
   * is booked this week is the same sentence eight times over, and it fills
   * the screen with the one thing there is nothing to say about.
   */
  const nothingAtAll = rows.every((r) => r.kind === "day" && r.count === 0);

  const allDay = entries.filter(
    (e) =>
      e.all_day &&
      days.some(
        (date) =>
          dayOf(e.starts_at, timezone) <= date && dayOf(e.ends_at, timezone) >= date,
      ),
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
        {(nothingAtAll ? [] : rows).map((row) => {
          if (row.kind === "day") {
            /*
             * A heading per day, and a word when there is nothing under it.
             *
             * A week with three quiet days should show the quiet days, not
             * close the gap and leave somebody counting dates to work out
             * which ones are missing.
             */
            return (
              <li key={`day-${row.date}`} className="pt-3 first:pt-0">
                <div className="flex items-baseline gap-2 border-b border-border pb-1.5">
                  <span className="text-sm font-semibold">{row.label}</span>
                  {/*
                    * A count, because a week for five people is eighty rows and
                    * the headings are what somebody scrolls past looking for
                    * the busy day.
                    */}
                  <span className="hint text-xs">
                    {row.count === 0
                      ? "nothing booked"
                      : `${row.count} ${row.count === 1 ? "appointment" : "appointments"}`}
                  </span>
                </div>
              </li>
            );
          }

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
                      // The gap's own day, which in a week is not the first one.
                      date: dayOf(from, timezone),
                      time: clock24(from, timezone),
                      endTime: clock24(row.to.toISOString(), timezone),
                    })
                  }
                  className="flex min-h-11 w-full items-center gap-3 rounded-xl border border-dashed border-border px-3.5 py-2 text-left text-xs text-muted transition-colors hover:border-solid hover:text-foreground"
                >
                  <span className="tabular-nums">{clockOf(from, timezone)}</span>
                  <span className="h-px flex-1 bg-border" aria-hidden />
                  {/*
                    * Said differently when several people share the day.
                    *
                    * "30m free" under a five-chair salon reads as one open
                    * slot, when what it actually means is the rarer and more
                    * interesting thing: not one of them has anybody in. The
                    * gap is only ever found when nothing at all overlaps it,
                    * so the words should say so.
                    */}
                  <span>
                    {lengthOf(row.to.getTime() - row.from.getTime())}
                    {artists.length > 1 ? " — nobody booked" : " free"}
                  </span>
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
                  * Wide enough for the widest it gets, which is 11:00 am.
                  *
                  * It started at 70px against text measuring about 48, and the
                  * difference sat on the left as an empty gutter down every
                  * row. Trimming it to 56 fixed that and broke the mornings:
                  * set solid, "11:00 am" is 57 pixels, so it wrapped onto two
                  * lines and every hour before noon was a different shape from
                  * every hour after it. 64 was the number that held both.
                  *
                  * Splitting the suffix off is what actually makes it smaller
                  * rather than tighter: 33px of hour and 15 of am, so 56 holds
                  * it with room, and nowrap means a stray pixel can never put
                  * the mornings back on two lines.
                  */}
                <span className="w-14 shrink-0 pt-px text-right">
                  <span className="block whitespace-nowrap text-sm font-semibold tabular-nums tracking-tight">
                    {splitClock(e.starts_at, timezone)[0]}
                    <span className="ml-0.5 text-[0.62rem] font-medium text-muted">
                      {splitClock(e.starts_at, timezone)[1]}
                    </span>
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
                    {/*
                      * Whose it is, in their own colour, when there is more
                      * than one of them.
                      *
                      * On a five-chair salon the name was grey text at the end
                      * of the line after the service and before the price, and
                      * "who is doing this" is the thing an owner scans a busy
                      * day for. As a filled chip in that person's colour it
                      * can be read down the page without reading any of the
                      * words.
                      */}
                    {artists.length > 1 && (
                      <span
                        className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[0.68rem] font-semibold"
                        style={
                          colourBy === "person"
                            ? { background: `${colourFor(e)}22`, color: colourFor(e) }
                            : undefined
                        }
                      >
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

        {nothingAtAll && allDay.length === 0 && (
          <li className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
            <p className="text-sm font-medium">
              Nothing booked {days.length > 1 ? "this week" : "today"}
            </p>
            <p className="hint mt-1">
              A clear {days.length > 1 ? "week" : "day"}. Tap Add to put something in it.
            </p>
          </li>
        )}
      </ol>

      {(open || creating) && (
        <EntryDialog
          entry={open}
          prefill={creating}
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
