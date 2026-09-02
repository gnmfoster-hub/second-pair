import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireStudio, getArtists } from "@/lib/studio";
import { startOfWeek, addDays, isoDate, parseIsoDate } from "@/lib/calendar";
import { WeekGrid, type Entry } from "./WeekGrid";
import { MonthGrid } from "./MonthGrid";
import { Shortcuts } from "./Shortcuts";
import { NewEntry } from "./NewEntry";
import { ColourBy } from "./ColourBy";
import { colourForName, type ColourMode } from "@/lib/diaryColour";
import { formatPence } from "@/lib/money";

type RawRow = {
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
  price_pence: number | null;
  repeats: string;
  contacts: { id: string; name: string | null; phone: string | null } | null;
  enquiries: {
    description: string | null;
    quote_low_pence: number | null;
    conversation_id: string;
    conversations: {
      contacts: { name: string | null; phone: string | null } | null;
    } | null;
  } | null;
};

export default async function DiaryPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; view?: string; day?: string; who?: string }>;
}) {
  const { week, view: viewParam, day: dayParam, who } = await searchParams;
  const { studio } = await requireStudio();
  const supabase = await createClient();
  const artists = await getArtists(studio.id);
  const team = artists.filter((a) => a.active);

  // With more than one person, the day — everyone side by side — is the view a
  // shop actually works from. On your own, the week is more useful.
  /*
   * Which view, and why it kept snapping back.
   *
   * This used to read: day if asked for, or if there is a team and nothing was
   * asked for. But the Week button links to ?week=<date> with no view
   * parameter — so on any diary with more than one person, clicking Week fell
   * straight through to "nothing was asked for" and went back to Day. Week
   * view was unreachable for a salon, which is the one place it earns its
   * keep.
   *
   * Now an explicit choice always wins, a ?week= is itself a choice, and the
   * team-size default only applies when nobody has asked for anything.
   */
  const view: "day" | "week" | "month" =
    viewParam === "day"
      ? "day"
      : viewParam === "month"
        ? "month"
        : viewParam === "week" || week
          ? "week"
          : team.length > 1
            ? "day"
            : "week";

  const focusDay = dayParam ? parseIsoDate(dayParam) : new Date();
  const anchor = week ? parseIsoDate(week) : focusDay;
  /*
   * A month is shown as whole weeks, so the grid is rectangular and the days
   * either side belong to the neighbouring months rather than being blanks.
   */
  const monthAnchor = new Date(
    Date.UTC(anchor.getFullYear(), anchor.getMonth(), 1, 12),
  );
  const monthStart = startOfWeek(monthAnchor);
  const monthEnd = (() => {
    const last = new Date(
      Date.UTC(anchor.getFullYear(), anchor.getMonth() + 1, 0, 12),
    );
    return addDays(startOfWeek(last), 7);
  })();

  const start =
    view === "day" ? focusDay : view === "month" ? monthStart : startOfWeek(anchor);
  const end =
    view === "day" ? addDays(focusDay, 1) : view === "month" ? monthEnd : addDays(start, 7);

  // A little either side, so a multi-day holiday starting last week still shows.
  const { data } = await supabase
    .from("bookings")
    .select(
      "id, artist_id, starts_at, ends_at, all_day, category, blocks_availability, source, " +
        "title, notes, deposit_status, deposit_amount_pence, price_pence, repeats, " +
        "contacts(id, name, phone), " +
        "enquiries(description, quote_low_pence, conversation_id, conversations(contacts(name, phone)))",
    )
    .is("cancelled_at", null)
    .lt("starts_at", addDays(end, 1).toISOString())
    .gt("ends_at", addDays(start, -1).toISOString())
    .order("starts_at");

  const focused = who && team.some((a) => a.id === who) ? who : null;
  const mine = new Set(
    (focused ? team.filter((a) => a.id === focused) : artists).map((a) => a.id),
  );
  const entries: Entry[] = ((data ?? []) as unknown as RawRow[])
    .filter((r) => mine.has(r.artist_id))
    .map((r) => ({
      id: r.id,
      artist_id: r.artist_id,
      starts_at: r.starts_at,
      ends_at: r.ends_at,
      all_day: r.all_day,
      category: r.category,
      blocks_availability: r.blocks_availability,
      source: r.source,
      title: r.title,
      notes: r.notes,
      deposit_status: r.deposit_status,
      deposit_amount_pence: r.deposit_amount_pence,
      price_pence: r.price_pence,
      // Either route: a conversation's contact, or one attached by hand.
      clientName: r.enquiries?.conversations?.contacts?.name ?? r.contacts?.name ?? null,
      clientPhone: r.enquiries?.conversations?.contacts?.phone ?? r.contacts?.phone ?? null,
      contactId: r.contacts?.id ?? null,
      description: r.enquiries?.description ?? null,
      conversationId: r.enquiries?.conversation_id ?? null,
      quotePence: r.enquiries?.quote_low_pence ?? null,
      repeats: r.repeats,
    }));

  const label =
    view === "day"
      ? focusDay.toLocaleDateString("en-GB", {
          weekday: "long",
          day: "numeric",
          month: "long",
        })
      : view === "month"
        ? anchor.toLocaleDateString("en-GB", { month: "long", year: "numeric" })
        : `${start.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${addDays(
            start,
            6,
          ).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;

  const monthWeeks: string[][] = [];
  for (let cursor = new Date(monthStart); cursor < monthEnd; cursor = addDays(cursor, 7)) {
    monthWeeks.push(Array.from({ length: 7 }, (_, i) => isoDate(addDays(cursor, i))));
  }

  const step = view === "day" ? 1 : 7;

  // A month steps by a month, not by four weeks, or the label drifts.
  const shiftMonth = (by: number) =>
    isoDate(new Date(Date.UTC(anchor.getFullYear(), anchor.getMonth() + by, 1, 12)));

  const back =
    view === "day"
      ? `/diary?view=day&day=${isoDate(addDays(focusDay, -step))}`
      : view === "month"
        ? `/diary?view=month&week=${shiftMonth(-1)}`
        : `/diary?view=week&week=${isoDate(addDays(start, -step))}`;
  const forward =
    view === "day"
      ? `/diary?view=day&day=${isoDate(addDays(focusDay, step))}`
      : view === "month"
        ? `/diary?view=month&week=${shiftMonth(1)}`
        : `/diary?view=week&week=${isoDate(addDays(start, step))}`;

  const awaiting = entries.filter(
    (e) => e.deposit_amount_pence > 0 && e.deposit_status !== "paid",
  ).length;

  /*
   * What the period is worth.
   *
   * A one-person business looking at their week wants three numbers: how much
   * of it is spoken for, what it earns, and how much room is left. The last
   * one is the reason to look — it is the answer to "can I fit this job in?"
   */
  /*
   * However many days are actually on screen.
   *
   * This counted seven whatever you were looking at, so a month's bookings were
   * being measured against a week's capacity — a figure that was quietly four
   * or five times too full and looked plausible enough not to notice.
   */
  const daysInView =
    view === "day" ? 1 : view === "month" ? monthWeeks.length * 7 : 7;

  const workingMinutes = Array.from({ length: daysInView }, (_, i) => {
    const d = addDays(view === "day" ? focusDay : start, i);
    const h = studio.hours.find((x) => x.day === d.getDay());
    if (!h || h.closed) return 0;
    const from = Number(h.open.slice(0, 2)) * 60 + Number(h.open.slice(3, 5));
    const to = Number(h.close.slice(0, 2)) * 60 + Number(h.close.slice(3, 5));
    return Math.max(0, to - from);
  }).reduce((a, b) => a + b, 0);

  const bookedMinutes = entries
    .filter((e) => e.blocks_availability && !e.all_day)
    .reduce(
      (total, e) => total + (Date.parse(e.ends_at) - Date.parse(e.starts_at)) / 60000,
      0,
    );

  /*
   * What was agreed, then what was quoted.
   *
   * It used to be the quote alone, which is only ever set on work the
   * assistant booked. A shop that types its own regulars in saw £0 every week
   * and quite reasonably stopped believing the number.
   */
  const worth = entries.reduce(
    (total, e) => total + (e.price_pence ?? e.quotePence ?? 0),
    0,
  );

  // Multiple people multiply the room available, so the figure means something
  // in a salon as well as in a van.
  const capacity = workingMinutes * Math.max(1, focused ? 1 : team.length);
  const freeMinutes = Math.max(0, capacity - bookedMinutes);
  const asHours = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = Math.round(mins % 60);
    return m ? `${h}h ${m}m` : `${h}h`;
  };

  return (
    <div className="mx-auto max-w-6xl px-8 py-9">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
        <h1 className="page-title">Diary</h1>
        <span className="hint">{label}</span>
        {awaiting > 0 && (
          <span className="rounded-full bg-warn/10 px-2.5 py-1 text-xs text-warn">
            {awaiting} waiting on a deposit
          </span>
        )}

        {/*
         * Wraps, or the phone scrolls sideways.
         *
         * Six controls — three views, back, today, forward, the colour
         * picker, the shortcuts key and Add — sat in one row that could not
         * break. On a 390px screen that was a hundred and nine pixels of
         * overflow: Add was off the edge of the display, and the whole page
         * slid left and right under the thumb, which on the screen an owner
         * opens twenty times a day is the worst place for it.
         */}
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          {/* One segmented control rather than five loose buttons: the view and
              the date are the same decision, and they belong together. */}
          <div className="flex overflow-hidden rounded-xl border border-border bg-surface">
            <Link
              href={`/diary?view=day&day=${isoDate(focusDay)}`}
              className={`px-3.5 py-2 text-sm font-medium transition-colors ${
                view === "day"
                  ? "bg-surface-2 text-foreground"
                  : "text-muted hover:text-foreground"
              }`}
            >
              Day
            </Link>
            <Link
              href={`/diary?view=week&week=${isoDate(view === "month" ? focusDay : start)}`}
              className={`border-l border-border px-3.5 py-2 text-sm font-medium transition-colors ${
                view === "week"
                  ? "bg-surface-2 text-foreground"
                  : "text-muted hover:text-foreground"
              }`}
            >
              Week
            </Link>
            {/*
             * The question day and week cannot answer: how does October look.
             * A tattooist books six weeks out and an owner wants to see which
             * weeks are thin before deciding to run an offer.
             */}
            <Link
              href={`/diary?view=month&week=${isoDate(anchor)}`}
              className={`border-l border-border px-3.5 py-2 text-sm font-medium transition-colors ${
                view === "month"
                  ? "bg-surface-2 text-foreground"
                  : "text-muted hover:text-foreground"
              }`}
            >
              Month
            </Link>
          </div>

          <div className="flex items-center overflow-hidden rounded-xl border border-border bg-surface">
            <Link
              href={back}
              className="px-3 py-2 text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
              aria-label="Previous"
            >
              ‹
            </Link>
            <Link
              href={`/diary?view=${view}`}
              className="border-x border-border px-3.5 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
            >
              Today
            </Link>
            <Link
              href={forward}
              className="px-3 py-2 text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
              aria-label="Next"
            >
              ›
            </Link>
          </div>

          <ColourBy
            current={(studio.diary_colour ?? "category") as ColourMode}
            hasTeam={team.length > 1}
          />

          <Shortcuts
            back={back}
            forward={forward}
            today={`/diary?view=${view}`}
            dayHref={`/diary?view=day&day=${isoDate(focusDay)}`}
            weekHref={`/diary?view=week&week=${isoDate(start)}`}
          />

          {/*
           * The only way to add anything used to be clicking the grid, which
           * nobody finds on their own. Amber, because the pack allows one call
           * to action per screen and on this page it is obviously this.
           */}
          <NewEntry artists={team} timezone={studio.timezone} />
        </div>
      </div>

      {/*
       * What this period is worth, and how much room is left.
       *
       * One line rather than three cards: the diary is what people came for,
       * and a row of large mostly-empty boxes pushed it below the fold. The
       * bar reads the same at a glance and costs a tenth of the space.
       */}
      {/*
       * The summary and the grid are one card, not two boxes.
       *
       * Stacked separately they read as two unrelated panels with a gap
       * between them; joined, the figures are plainly a caption for the week
       * underneath, which is what they are.
       */}
      {/*
        * The grid arrives rather than appearing.
        *
        * The front page has done this since the design pass and the diary never
        * did, which is backwards: this is the screen an owner opens twenty times
        * a day, and it was the one that snapped into place like a table being
        * printed. One beat, and it stops for anybody who has asked for less
        * motion.
        */}
      <div className="card settle relative mt-5 overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-border px-4 py-2.5 text-sm">
        <Figure label="booked" value={asHours(bookedMinutes)} />
        <Figure label="worth" value={formatPence(worth)} accent={worth > 0} />
        {/*
          * "0h free" is a lie when nobody has said when they are open.
          *
          * It reads as "you are fully booked" to somebody whose diary is
          * completely empty — the opposite of the truth, on the day they are
          * setting the business up.
          */}
        <Figure label="free" value={capacity > 0 ? asHours(freeMinutes) : "—"} />

        {capacity > 0 ? (
          <div className="ml-auto flex items-center gap-2.5">
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-accent"
                style={{
                  width: `${Math.min(100, Math.round((bookedMinutes / capacity) * 100))}%`,
                }}
              />
            </div>
            <span className="hint num">
              {Math.round((bookedMinutes / capacity) * 100)}% full
            </span>
          </div>
        ) : (
          <Link href="/settings" className="ml-auto text-xs text-warn hover:underline">
            No opening hours set — add them
          </Link>
        )}
      </div>

      {team.length > 1 && (
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          <Link
            href={
              view === "day"
                ? `/diary?view=day&day=${isoDate(focusDay)}`
                : `/diary?view=week&week=${isoDate(start)}`
            }
            className={`rounded-full px-3 py-1 text-xs transition-colors ${
              !focused ? "bg-surface-2 text-foreground" : "border border-border text-muted hover:text-foreground"
            }`}
          >
            Everyone
          </Link>
          {team.map((a) => (
            <Link
              key={a.id}
              href={
                view === "day"
                  ? `/diary?view=day&day=${isoDate(focusDay)}&who=${a.id}`
                  : `/diary?view=week&week=${isoDate(start)}&who=${a.id}`
              }
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs transition-colors ${
                focused === a.id
                  ? "bg-surface-2 text-foreground"
                  : "border border-border text-muted hover:text-foreground"
              }`}
            >
              {/*
               * The chips are the key.
               *
               * Cards are coloured by person, and nothing anywhere said which
               * colour was whose — so a four-chair salon read as pretty
               * confetti. A dot on the name each person already has costs no
               * space and answers it, without a legend to put somewhere.
               *
               * Only when the colour actually means the person; by client or by
               * category a dot here would be a lie.
               */}
              {(studio.diary_colour ?? "category") === "person" && (
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: a.colour || colourForName(a.name) }}
                  aria-hidden
                />
              )}
              {a.name}
            </Link>
          ))}
        </div>
      )}

      {/*
       * The instructions used to sit here as a paragraph above the diary,
       * where they were read once and then got in the way every day
       * afterwards. They live under the ? key now, with the shortcuts.
       */}

      {/*
        * What an empty diary should say.
        *
        * It said nothing at all: a new business opened the screen it will spend
        * its day in and got a grey grid, two names, and a small orange line in
        * the far corner — which was the only thing on the page that mattered,
        * because without opening hours the assistant cannot offer a time and
        * nothing can ever be booked.
        *
        * Two different silences, so two different answers. No hours is a
        * blocked product and says so. An empty day is just a quiet day, and the
        * only useful thing to say is how to put something in it — which was
        * documented under the ? key, where nobody looks on their first morning.
        */}
      {entries.length === 0 && (
        <div className="pointer-events-none absolute inset-x-0 top-1/2 z-10 flex -translate-y-1/2 justify-center px-6">
          {/*
            * On a surface of its own, because grid lines run underneath it.
            *
            * Set on the ruled paper it was reading as something written across
            * the diary rather than something about it, and the button in
            * particular disappeared into the eleven o'clock line.
            */}
          <div className="max-w-xs rounded-2xl border border-border bg-surface/95 px-5 py-4 text-center shadow-[var(--shadow-pop)] backdrop-blur-sm">
            {capacity === 0 ? (
              <>
                <p className="text-sm font-medium">Your hours aren&rsquo;t set yet</p>
                <p className="hint mt-1.5">
                  Until they are, the assistant has no times to offer and nothing can be
                  booked — by it or by you.
                </p>
                <Link
                  href="/settings"
                  className="btn pointer-events-auto mt-3.5 inline-flex bg-accent text-on-accent"
                >
                  Set your opening hours
                </Link>
              </>
            ) : (
              <p className="hint">
                Nothing booked{view === "day" ? " today" : " yet"}. Drag down a column to
                put something in.
              </p>
            )}
          </div>
        </div>
      )}

        {view === "month" ? (
          <MonthGrid
            weeks={monthWeeks}
            entries={entries}
            monthIndex={anchor.getMonth()}
            todayKey={isoDate(new Date())}
            timezone={studio.timezone}
            colourBy={(studio.diary_colour ?? "category") as ColourMode}
          />
        ) : (
        <WeekGrid
          weekStart={isoDate(start)}
          day={isoDate(focusDay)}
          view={view}
          colourBy={(studio.diary_colour ?? "category") as ColourMode}
          entries={entries}
          artists={focused ? team.filter((a) => a.id === focused) : team}
          hours={studio.hours}
          timezone={studio.timezone}
        />
        )}
      </div>

    </div>
  );
}

/**
 * One number from the strip.
 *
 * Deliberately quiet: this sits above the diary and must never compete with
 * it. The only one allowed any colour is what the period earns.
 */
function Figure({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span
        className={`font-display text-base font-semibold tabular-nums ${accent ? "text-accent" : ""}`}
      >
        {value}
      </span>
      <span className="text-xs text-muted">{label}</span>
    </span>
  );
}
