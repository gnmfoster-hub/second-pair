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
  searchParams: Promise<{ week?: string }>;
}) {
  const { week } = await searchParams;
  const { studio } = await requireStudio();
  const supabase = await createClient();
  const artists = await getArtists(studio.id);

  const anchor = week ? parseIsoDate(week) : new Date();
  const start = startOfWeek(anchor);
  const end = addDays(start, 7);

  // A little either side, so a multi-day holiday starting last week still shows.
  const { data } = await supabase
    .from("bookings")
    .select(
      "id, artist_id, starts_at, ends_at, all_day, category, blocks_availability, source, " +
        "title, notes, deposit_status, deposit_amount_pence, " +
        "enquiries(description, conversation_id, conversations(contacts(name, phone)))",
    )
    .is("cancelled_at", null)
    .lt("starts_at", addDays(end, 1).toISOString())
    .gt("ends_at", addDays(start, -1).toISOString())
    .order("starts_at");

  const mine = new Set(artists.map((a) => a.id));
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
    }));

  const label = `${start.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${addDays(
    start,
    6,
  ).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;

  const awaiting = entries.filter(
    (e) => e.source === "assistant" && e.deposit_status !== "paid",
  ).length;

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
        <h1 className="text-xl font-semibold tracking-tight">Diary</h1>
        <span className="hint">{label}</span>
        {awaiting > 0 && (
          <span className="rounded-full bg-warn/10 px-2.5 py-1 text-xs text-warn">
            {awaiting} waiting on a deposit
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          <Link href={`/diary?week=${isoDate(addDays(start, -7))}`} className="btn-ghost px-3">
            ←
          </Link>
          <Link href="/diary" className="btn-ghost">
            Today
          </Link>
          <Link href={`/diary?week=${isoDate(addDays(start, 7))}`} className="btn-ghost px-3">
            →
          </Link>
        </div>
      </div>

      <p className="hint mt-1">
        Click any empty space to add something — a meeting, a delivery to chase, a day off.
        Click an entry to change it.
      </p>

      <div className="mt-6">
        <WeekGrid
          weekStart={isoDate(start)}
          entries={entries}
          artists={artists.filter((a) => a.active)}
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
