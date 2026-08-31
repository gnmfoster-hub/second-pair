import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireStudio, getArtists } from "@/lib/studio";
import { startOfWeek, addDays, isoDate, parseIsoDate, CATEGORIES } from "@/lib/calendar";
import { WeekGrid, type Entry } from "./WeekGrid";

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
  enquiries: {
    description: string | null;
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
  const view = viewParam === "day" || (!viewParam && team.length > 1) ? "day" : "week";

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
        "enquiries(description, conversation_id, conversations(contacts(name, phone)))",
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
      clientName: r.enquiries?.conversations?.contacts?.name ?? null,
      clientPhone: r.enquiries?.conversations?.contacts?.phone ?? null,
      description: r.enquiries?.description ?? null,
      conversationId: r.enquiries?.conversation_id ?? null,
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
    : `/diary?week=${isoDate(addDays(start, -step))}`;
  const forward = view === "day"
    ? `/diary?view=day&day=${isoDate(addDays(focusDay, step))}`
    : `/diary?week=${isoDate(addDays(start, step))}`;

  const awaiting = entries.filter(
    (e) => e.source === "assistant" && e.deposit_status !== "paid",
  ).length;

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
          <div className="flex overflow-hidden rounded-lg border border-border">
            <Link
              href={`/diary?view=day&day=${isoDate(focusDay)}`}
              className={`px-3 py-2 text-sm ${view === "day" ? "bg-surface-2 text-foreground" : "text-muted hover:text-foreground"}`}
            >
              Day
            </Link>
            <Link
              href={`/diary?week=${isoDate(start)}`}
              className={`px-3 py-2 text-sm ${view === "week" ? "bg-surface-2 text-foreground" : "text-muted hover:text-foreground"}`}
            >
              Week
            </Link>
          </div>
          <Link href={back} className="btn-ghost px-3" aria-label="Previous">
            ←
          </Link>
          <Link href={view === "day" ? "/diary?view=day" : "/diary"} className="btn-ghost">
            Today
          </Link>
          <Link href={forward} className="btn-ghost px-3" aria-label="Next">
            →
          </Link>
        </div>
      </div>

      {team.length > 1 && (
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          <Link
            href={view === "day" ? `/diary?view=day&day=${isoDate(focusDay)}` : `/diary?week=${isoDate(start)}`}
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
                  : `/diary?week=${isoDate(start)}&who=${a.id}`
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

      <p className="hint mt-3">
        Click any empty space to add something — a meeting, a delivery to chase, a day off.
        Click an entry to change it.
        {team.length > 1
          ? " Day view puts everyone side by side; week view shows one person at a time."
          : ""}
      </p>

      <div className="mt-6">
        <WeekGrid
          weekStart={isoDate(start)}
          day={isoDate(focusDay)}
          view={view}
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
