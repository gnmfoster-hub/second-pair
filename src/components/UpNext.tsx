import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Avatar } from "@/components/Avatar";
import type { Artist } from "@/lib/types";

/**
 * What is next, in the sidebar, on every page.
 *
 * The middle of the sidebar was empty on every screen. Rather than decorate
 * it, it now answers the question a one-person business asks more than any
 * other: what have I got on, and when.
 *
 * Deliberately one entry rather than a list. Three would be a second diary,
 * and there is already a diary.
 */
export async function UpNext({
  timezone,
  team,
}: {
  timezone: string;
  /** Already scoped to this business, which is what keeps the query scoped. */
  team: Artist[];
}) {
  const supabase = await createClient();
  const now = new Date();

  const ids = team.map((a) => a.id);
  if (ids.length === 0) return null;

  const { data } = await supabase
    .from("bookings")
    .select(
      "id, artist_id, starts_at, ends_at, title, category, all_day, " +
        "contacts(name), enquiries(description, conversations(contacts(name)))",
    )
    .in("artist_id", ids)
    .is("cancelled_at", null)
    // Anything that has not finished yet, so the one you are in the middle of
    // still counts as next — it is the one you are actually thinking about.
    .gt("ends_at", now.toISOString())
    .order("starts_at")
    .limit(1);

  const row = data?.[0] as
    | {
        id: string;
        artist_id: string;
        starts_at: string;
        ends_at: string;
        title: string | null;
        all_day: boolean;
        contacts: { name: string | null } | null;
        enquiries: {
          description: string | null;
          conversations: { contacts: { name: string | null } | null } | null;
        } | null;
      }
    | undefined;

  if (!row) {
    return (
      <div className="mx-3 mt-6 rounded-xl border border-dashed border-border px-3.5 py-4">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">
          Up next
        </div>
        <p className="hint mt-1.5">Nothing booked. Enjoy it while it lasts.</p>
      </div>
    );
  }

  const who = team.find((a) => a.id === row.artist_id);
  const name =
    row.enquiries?.conversations?.contacts?.name ?? row.contacts?.name ?? row.title;

  const starts = new Date(row.starts_at);
  const running = starts <= now;

  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(starts);

  const today =
    new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(starts) ===
    new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(now);

  const day = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(starts);

  return (
    <Link
      href="/diary"
      className="group mx-3 mt-6 block rounded-xl border border-border bg-surface-2/50 px-3.5 py-3.5 transition-colors hover:border-accent/40 hover:bg-surface-2"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
          {running ? "On now" : "Up next"}
        </span>
        {running && (
          <span className="relative flex size-1.5" aria-hidden>
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-ok opacity-60" />
            <span className="relative inline-flex size-1.5 rounded-full bg-ok" />
          </span>
        )}
      </div>

      <div className="num mt-1.5 font-display text-lg font-semibold leading-none">
        {row.all_day ? "All day" : time}
      </div>
      <div className="hint mt-0.5">{today ? "Today" : day}</div>

      <div className="mt-2.5 flex items-center gap-2 border-t border-border pt-2.5">
        {who && team.length > 1 && <Avatar person={who} size="xs" />}
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {name ?? "Booked"}
        </span>
      </div>

      {row.enquiries?.description && (
        <p className="hint mt-1 line-clamp-2">{row.enquiries.description}</p>
      )}
    </Link>
  );
}
