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
import { hueFor, initialsOf, colourForName, type ColourMode } from "@/lib/diaryColour";
import { EntryDialog } from "./EntryDialog";
import { moveDiaryEntry } from "./actions";
import { zonedToUtc as toUtc } from "@/lib/booking/tz";
import { useDrag, clockOf, lengthOf, SNAP_MINUTES } from "./useDrag";
import { Avatar } from "@/components/Avatar";
import type { Artist, OpeningHours } from "@/lib/types";
import { gapsFor, saidAloud, minutesInDay } from "@/lib/diaryGaps";

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
  /** Set when a manual entry was attached to somebody. */
  contactId: string | null;
  description: string | null;
  conversationId: string | null;
  /** What this booking comes to. Set by hand; falls back to the quote. */
  price_pence: number | null;
  /** What the enquiry was quoted, for the week's worth. */
  quotePence: number | null;
  repeats: string;
};

/*
 * Sixty pixels an hour left a 45-minute appointment 45px for two lines of
 * text, which is why they felt cramped. Seventy-two gives a card room to
 * breathe without costing much of the week — an open day still fits on one
 * screen, and the diary is read far more often than it is scrolled.
 */
const HOUR_HEIGHT = 72;

/*
 * The narrowest a column may get before the grid scrolls sideways instead.
 *
 * Seven days across a 414px phone leaves about 49 pixels each, which is not a
 * diary — a card cannot hold a name in it. Below this the columns keep their
 * width and the grid scrolls, the way every desktop calendar handles a week on
 * a narrow screen.
 */
const MIN_COLUMN = 116;

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
 * "9:00 – 9:45 am", not "9:00 am – 9:45 am".
 *
 * Saying am twice costs six characters on a card that is already narrow, and
 * it was pushing the end time off the edge in a seven-day week. Every calendar
 * drops it from the first half when both halves share it; when they straddle
 * noon or midnight it has to stay, and it does.
 */
function timeRange(startIso: string, endIso: string, timezone: string): string {
  const start = clock(startIso, timezone);
  const end = clock(endIso, timezone);

  const startMeridiem = start.slice(-2);
  const endMeridiem = end.slice(-2);

  return startMeridiem === endMeridiem
    ? `${start.slice(0, -3)} – ${end}`
    : `${start} – ${end}`;
}

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

    /*
     * Beyond four abreast, dividing the column evenly makes slivers.
     *
     * A salon with five stylists all booked at ten produced five columns
     * about twenty pixels wide, which is not a diary — it is a bar chart of
     * nothing. Past four, the cards cascade with an offset and overlap
     * instead, the way every desktop calendar handles a crowded hour: the
     * front one is readable and the rest are visibly there behind it.
     */
    const abreast = Math.min(overlapping, 4);
    const cascade = overlapping > 4 ? index - 3 : 0;

    return {
      entry,
      left: (Math.min(index, 3) / Math.max(1, abreast)) * 100 + cascade * 3,
      width: 100 / Math.max(1, abreast),
      // Later cards sit on top, so the cascade reads as a stack.
      depth: index,
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
  colourBy,
}: {
  weekStart: string;
  entries: Entry[];
  artists: Artist[];
  hours: OpeningHours[];
  timezone: string;
  view: "week" | "day";
  day: string;
  colourBy: ColourMode;
}) {
  /*
   * Which entry is open, not a copy of it.
   *
   * This held the entry object itself, captured at the moment it was clicked.
   * Move the appointment afterwards — drag it to another person, or to another
   * time — and the card redrew from fresh data while the dialog went on showing
   * the snapshot. The grid said one thing and the box open over it said another.
   *
   * Holding the id and looking it up each render means the dialog is always
   * showing what is actually there. It also closes itself if the entry stops
   * existing, which is the right answer to somebody deleting it in another tab.
   */
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = editingId ? (entries.find((e) => e.id === editingId) ?? null) : null;

  const setEditing = (entry: Entry | null) => setEditingId(entry?.id ?? null);
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
      return artists.map((a) => ({
        key: a.id,
        label: a.name,
        sub: "",
        month: "",
        date: day,
        artist: a,
      }));
    }
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(start, i);
      return {
        key: isoDate(d),
        label: d.toLocaleDateString("en-GB", { weekday: "short" }),
        sub: String(d.getDate()),
        // Shown under the weekday, so the month is never a guess — the first
        // few days of a week can belong to the previous one.
        month: d.toLocaleDateString("en-GB", { month: "short" }),
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

    /*
     * Land the hour below the names, not behind them.
     *
     * The headings are sticky, so scrolling an hour to the very top of the
     * scroller parks it underneath them — you opened the diary and the first
     * hour you could read was an hour later than the one it had chosen for
     * you. Measured rather than guessed, because the row is one line on a
     * phone and two beside an avatar.
     */
    const scroller_ = scroller.current;
    if (!scroller_) return;

    const headings = scroller_.querySelector<HTMLElement>("[data-diary-headings]");
    const clearance = headings?.offsetHeight ?? 0;
    scroller_.scrollTop = Math.max(0, target * HOUR_HEIGHT - clearance);
  }, [hours]);

  /*
   * How wide the grid needs to be for every column to stay readable.
   *
   * The time gutter is fixed; the rest is the columns at their floor. When
   * that is wider than the screen the wrapper scrolls, which is why the gutter
   * and the headings are sticky.
   */
  const gridWidth = 68 + columns.length * MIN_COLUMN;

  /*
   * How much room a card has, and therefore how big its writing should be.
   *
   * The card text was a fixed 11.5px whatever the view. In a seven-day week
   * that is right — the columns are barely wider than the words. In a day view
   * with two people the cards are five hundred pixels across and seventy tall,
   * and the appointment, which is the most important object on the busiest
   * screen in the product, was still whispering at eleven and a half.
   *
   * Two sizes rather than a fluid scale: the jump happens when the layout
   * changes, so it never reflows while somebody is reading.
   */
  const roomy = columns.length <= 3;

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

  /*
   * Where "now" is.
   *
   * Every calendar people already use draws this, and it is the thing the eye
   * goes to first: what is happening, what has been missed, how long until the
   * next one. Without it a working day is a wall of boxes you have to read the
   * times on.
   *
   * A minute is plenty — the line moves about a pixel in that time.
   */
  /*
   * There is one current-time line, and it is drawn from `nowMinutes` above.
   *
   * There were two. The second kept its own clock in
   * `useState(() => Date.now())`, which runs on the server as well — so the
   * page was sent with the line at 1290px and hydrated with it at 1291.2, and
   * React logged a mismatch on every single load of the busiest screen in the
   * app. Two lines were also drawn on top of each other, which nobody noticed
   * because they were a pixel apart and the same colour.
   *
   * The surviving one is set in an effect, so the server sends no line at all
   * and the browser draws it once it knows what time it is where the customer
   * is. That is the honest arrangement: the server genuinely does not know.
   */

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

      <div ref={scroller} className="max-h-[70vh] overflow-auto">
        {/* ------------------------------------------------ headings */}
        <div
          data-diary-headings
          className="sticky top-0 z-20 flex border-b border-border bg-surface/95 backdrop-blur"
          style={{ minWidth: gridWidth }}
        >
          {/* Sticky left, so the times stay put while the week scrolls under
              them — a column of numbers that scrolls away is no use. */}
          <div className="sticky left-0 z-10 w-[4.25rem] shrink-0 border-r border-border bg-surface/95 backdrop-blur" />
          {columns.map((col) => {
            const isToday = view === "week" && col.date === todayKey;
            const weekday = new Date(col.date).getDay();
            const closed = view === "week" && hours.find((h) => h.day === weekday)?.closed;

            return (
              <div
                key={col.key}
                /*
                 * min-w-0, or the heading stops matching its own column.
                 *
                 * flex-1 is flex: 1 1 0%, but a flex item still refuses to go
                 * below its min-content width — so a heading sized itself to
                 * the name in it while the empty column below stayed at 116px.
                 * The error accumulated left to right: by the fifth person the
                 * name sat sixty-eight pixels off, over half a column, above
                 * somebody else's appointments. On the page the whole business
                 * is read from, whose column is whose has to be exact.
                 *
                 * min-w-0 releases that floor, which is also what finally lets
                 * the truncate on the name do its job.
                 */
                className={`min-w-0 flex-1 border-r border-border px-2 py-2.5 text-center last:border-r-0 ${
                  // Weekends sit back a little, so the working week reads first.
                  view === "week" && (weekday === 0 || weekday === 6)
                    ? "bg-surface-2/40"
                    : ""
                }`}
              >
                {col.artist ? (
                  <div className="flex min-w-0 items-center justify-center gap-1.5">
                    <Avatar person={col.artist} size="sm" />
                    <span className="truncate text-sm font-medium">{col.label}</span>
                  </div>
                ) : (
                  /*
                   * The day and the date, side by side and both readable.
                   *
                   * They were a tiny uppercase label above a small circle,
                   * which meant squinting to tell Tuesday the 1st from
                   * Thursday the 3rd — on the page people look at all day.
                   */
                  <div className="flex items-center justify-center gap-2">
                    <span
                      className={`grid size-9 place-items-center rounded-xl font-display text-lg font-bold tabular-nums leading-none ${
                        isToday
                          ? "bg-accent text-on-accent shadow-[var(--shadow-card)]"
                          : closed
                            ? "text-muted/70"
                            : "text-foreground"
                      }`}
                    >
                      {col.sub}
                    </span>
                    <span className="text-left leading-tight">
                      <span
                        className={`block text-[0.82rem] font-semibold tracking-tight ${
                          isToday ? "text-accent" : closed ? "text-muted" : "text-foreground"
                        }`}
                      >
                        {col.label}
                      </span>
                      <span className="block text-[10px] uppercase tracking-wide text-muted">
                        {col.month}
                      </span>
                    </span>
                  </div>
                )}
                {closed && (
                  <div className="text-[10px] font-medium uppercase tracking-wide text-muted">
                    closed
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ------------------------------------------------ all-day band */}
        {allDay.length > 0 && (
          <div
            className="flex border-b border-border bg-surface-2/40"
            style={{ minWidth: gridWidth }}
          >
            <div className="sticky left-0 z-10 w-[4.25rem] shrink-0 border-r border-border bg-surface-2 px-2 py-1.5 text-[10px] uppercase tracking-wide text-muted">
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
                    const who = artists.find((a) => a.id === e.artist_id);
                    const hue = hueFor(
                      colourBy,
                      { clientName: e.clientName, artistName: who?.name },
                      cat.hue,
                    );
                    return (
                      <button
                        key={e.id}
                        type="button"
                        onClick={() => setEditing(e)}
                        className="block w-full truncate rounded-md px-2 py-1 text-left text-[11px] font-medium"
                        style={{
                          background: `color-mix(in srgb, ${hue} 22%, transparent)`,
                          color: hue,
                          boxShadow: `inset 2px 0 0 ${hue}`,
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
        <div>
          <div className="flex" style={{ minWidth: gridWidth }}>
            <div className="sticky left-0 z-10 w-[4.25rem] shrink-0 border-r border-border bg-surface">
              {hourList.map((h) => (
                <div key={h} style={{ height: HOUR_HEIGHT }} className="relative">
                  {/*
                   * Sitting on the line rather than under it, so the eye
                   * matches a time to the rule it belongs to.
                   *
                   * The hour is the size of body text and the am/pm is not —
                   * at a glance you are looking for "3", and the suffix only
                   * matters once you have found it.
                   */}
                  <span className="absolute -top-2.5 right-3 flex items-baseline gap-0.5">
                    <span className="num text-[13px] font-semibold text-foreground/85">
                      {h === 0 ? "" : h % 12 === 0 ? 12 : h % 12}
                    </span>
                    <span className="text-[9px] font-medium text-muted/70">
                      {h === 0 ? "" : h < 12 ? "am" : "pm"}
                    </span>
                  </span>
                </div>
              ))}
            </div>

            {columns.map((col, index) => {
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
                  className={`relative flex-1 cursor-copy touch-none border-r border-cal-grid last:border-r-0 ${
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
                  {/*
                   * The hour is a line and the half hour is nothing at all.
                   *
                   * A dashed half-hour rule in every column of every day added
                   * up to more ink than the appointments, which are the point.
                   * Dragging already snaps to fifteen minutes without needing
                   * to be shown where.
                   */}
                  {hourList.map((h) => (
                    <div key={h} style={{ height: HOUR_HEIGHT }} className="relative">
                      <div className="absolute inset-x-0 top-0 border-t border-cal-grid" />
                    </div>
                  ))}

                  {/*
                    * Where the day is free, said in words.
                    *
                    * Drawn under the appointments and above the closed-hours
                    * shading, so it never covers anything and never survives
                    * into time the business is shut. It is a reading of the
                    * column rather than a thing in it — which is why it takes
                    * no clicks and no pointer events, and dragging a new
                    * appointment straight across it works exactly as before.
                    */}
                  {gapsFor(laid, opening, HOUR_HEIGHT).map((gap) => (
                    <div
                      key={gap.top}
                      className="pointer-events-none absolute inset-x-0 flex items-center justify-center"
                      style={{ top: gap.top, height: gap.height }}
                      aria-hidden
                    >
                      <span className="num rounded-full px-2 py-0.5 text-[10px] text-muted/70">
                        {saidAloud(gap.minutes)} free
                      </span>
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
                      {/* One dot, at the start of the line. Rendering it in
                          every column put a bead on each boundary, which read
                          as five separate markers rather than one time. */}
                      {index === 0 && (
                        <span className="absolute -left-1.5 -top-[5px] size-2.5 rounded-full bg-[var(--highlight)] ring-2 ring-surface" />
                      )}
                    </div>
                  )}

                  {laid.map(({ entry: e, top, height, left, width, depth }) => {
                    const cat = categoryFor(e.category);
                    const artist = artists.find((a) => a.id === e.artist_id);

                    // What this entry's colour means is the owner's choice.
                    const hue = hueFor(
                      colourBy,
                      { clientName: e.clientName, artistName: artist?.name },
                      cat.hue,
                    );

                    /*
                     * Whose it is, when that is not otherwise obvious.
                     *
                     * Week view puts the whole team in one column per day,
                     * so without this a salon cannot tell four stylists
                     * apart. Day view already has a column each, so it
                     * would only be noise there.
                     */
                    const showWho = view === "week" && artists.length > 1 && artist;
                    /*
                     * Owed, not "came from the assistant".
                     *
                     * This used to key on the source, so a booking taken over
                     * the phone with a deposit owing never showed as unpaid —
                     * which is exactly the one somebody needs chasing about.
                     */
                    const unpaid =
                      e.deposit_amount_pence > 0 && e.deposit_status !== "paid";
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
                          zIndex: 1 + depth,
                          /*
                           * One edge treatment, not three.
                           *
                           * These carried a border, an inset stripe and a
                           * shadow at once, which fought each other and left
                           * the fill so pale the colour did no work. Now the
                           * fill is confident enough to be the boundary, and
                           * the bar down the left is the only edge.
                           */
                          background: `color-mix(in srgb, ${hue} ${e.blocks_availability ? 22 : 12}%, var(--surface))`,
                          borderLeft: `3px solid ${unpaid ? "var(--warn)" : hue}`,
                          color: "var(--foreground)",
                        }}
                      >
                        <div
                          className={`flex items-center gap-1 truncate font-semibold ${
                            roomy ? "text-[13.5px]" : "text-[11.5px]"
                          }`}
                        >
                          {showWho && (
                            <span
                              className="grid size-4 shrink-0 place-items-center rounded-full text-[8px] font-bold text-white"
                              style={{ background: colourForName(artist.name) }}
                              title={artist.name}
                            >
                              {initialsOf(artist.name)}
                            </span>
                          )}
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
                        {/*
                          * When it starts and when it ends.
                          *
                          * The height says how long it runs, but only if you
                          * measure it against the hour lines — and "how long
                          * have I got after this" is a question asked far more
                          * often than that is worth. The end time only appears
                          * where the card is wide enough for both, so a
                          * fifteen-minute slot in a seven-day week is not made
                          * unreadable for it.
                          */}
                        {height > 32 && (
                          <div
                            className={`num truncate text-foreground/85 ${
                              roomy ? "mt-0.5 text-[12px]" : "text-[11px]"
                            }`}
                          >
                            {width > 45
                              ? timeRange(e.starts_at, e.ends_at, timezone)
                              : clock(e.starts_at, timezone)}
                          </div>
                        )}
                        {height > 54 && (e.description || e.notes) && (
                          <div className="truncate text-foreground/70">
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
                      <div className="truncate text-foreground/70">
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
