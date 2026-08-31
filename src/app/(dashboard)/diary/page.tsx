import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireStudio, getArtists } from "@/lib/studio";
import { startOfWeek, addDays, isoDate, parseIsoDate, CATEGORIES } from "@/lib/calendar";
import { WeekGrid, type Entry } from "./WeekGrid";
import { Shortcuts } from "./Shortcuts";
import { NewEntry } from "./NewEntry";
import { ColourBy } from "./ColourBy";
import type { ColourMode } from "@/lib/diaryColour";
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
  const view: "day" | "week" =
    viewParam === "day"
      ? "day"
      : viewParam === "week" || week
        ? "week"
        : team.length > 1
          ? "day"
          : "week";

  const focusDay = dayParam ? parseIsoDate(dayParam) : new Date();
  const anchor = week ? parseIsoDate(week) : focusDay;
  const start = view === "day" ? focusDay : startOfWeek(anchor);
  const end = view === "day" ? addDays(focusDay, 1) : addDays(start, 7);

  // A little either side, so a multi-day holiday starting last week still shows.
  const { data } = await supabase
    .from("bookings")
    .select(
      "id, artist_id, starts_at, ends_at, all_day, category, blocks_availability, source, " +
        "title, notes, deposit_status, deposit_amount_pence, repeats, " +
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
      : `${start.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${addDays(
          start,
          6,
        ).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;

  const step = view === "day" ? 1 : 7;
  const back = view === "day"
    ? `/diary?view=day&day=${isoDate(addDays(focusDay, -step))}`
    : `/diary?view=week&week=${isoDate(addDays(start, -step))}`;
  const forward = view === "day"
    ? `/diary?view=day&day=${isoDate(addDays(focusDay, step))}`
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
  const workingMinutes = Array.from({ length: view === "day" ? 1 : 7 }, (_, i) => {
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

  const worth = entries.reduce((total, e) => total + (e.quotePence ?? 0), 0);

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

        <div className="ml-auto flex items-center gap-2">
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
              href={`/diary?view=week&week=${isoDate(start)}`}
              className={`border-l border-border px-3.5 py-2 text-sm font-medium transition-colors ${
                view === "week"
                  ? "bg-surface-2 text-foreground"
                  : "text-muted hover:text-foreground"
              }`}
            >
              Week
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
              href={view === "day" ? "/diary?view=day" : "/diary?view=week"}
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
            today={view === "day" ? "/diary?view=day" : "/diary?view=week"}
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
      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm">
        <Figure label="booked" value={asHours(bookedMinutes)} />
        <Figure label="worth" value={formatPence(worth)} accent={worth > 0} />
        <Figure label="free" value={asHours(freeMinutes)} />

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
              className={`rounded-full px-3 py-1 text-xs transition-colors ${
                focused === a.id
                  ? "bg-surface-2 text-foreground"
                  : "border border-border text-muted hover:text-foreground"
              }`}
            >
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

      <div className="mt-4">
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
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
        {[...new Map(CATEGORIES.map((c) => [c.hue, c])).values()].map((c) => (
          <span key={c.hue} className="flex items-center gap-1.5 text-xs text-muted">
            <span className="size-2.5 rounded-sm" style={{ background: c.hue }} />
            {c.hue === "var(--cal-client)"
              ? "Clients"
              : c.hue === "var(--cal-work)"
                ? "Work"
                : c.hue === "var(--cal-off)"
                  ? "Time off"
                  : "Notes — do not block"}
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-xs text-muted">
          <span className="h-2.5 w-1 rounded-sm bg-warn" />
          Deposit unpaid
        </span>
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
