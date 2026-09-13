import { formatPence } from "@/lib/money";
import type { Artist } from "@/lib/types";

/**
 * Everything that has happened with this client, in one column.
 *
 * Bookings and reminders were kept apart, and reminders were not shown at all
 * — so when somebody rang up saying they had never been reminded, the owner
 * had no way to check. The reminders table has always recorded exactly what
 * was sent and when; it just never reached a screen.
 *
 * One list rather than two, because "we sent this, then they came" is a story
 * and two lists side by side are not.
 */

export type TimelineBooking = {
  id: string;
  artist_id: string;
  starts_at: string;
  type: string;
  cancelled_at: string | null;
  attended: boolean | null;
  deposit_amount_pence: number;
  deposit_status: string;
  /** Minutes it ran, where somebody said. Null for most of them. */
  actual_minutes: number | null;
  /** What happened, in the business's own words. Never shown to the client. */
  outcome_note: string | null;
  /** What it was booked for, so an overrun can be said as an overrun. */
  booked_minutes: number | null;
};

export type TimelineReminder = {
  id: string;
  booking_id: string;
  due_at: string;
  sent_at: string | null;
  status: string;
  channel: string | null;
  body: string | null;
  error: string | null;
};

/**
 * How long it ran, said only when it is worth saying.
 *
 * Silence when nobody recorded it, which is most of them, and silence when it
 * took exactly what it was booked for — a line reading "60 minutes, booked for
 * 60" is noise on every row that went normally, and noise on every row is how
 * the interesting ones stop being noticed.
 */
function ranFor(b: TimelineBooking): string {
  if (b.actual_minutes == null) return "";
  if (b.booked_minutes == null) return ` · ran ${b.actual_minutes} min`;

  const over = b.actual_minutes - b.booked_minutes;
  if (over === 0) return "";
  return over > 0 ? ` · ran ${over} min over` : ` · ${-over} min under`;
}

type Item =
  | { kind: "booking"; at: string; booking: TimelineBooking }
  | { kind: "reminder"; at: string; reminder: TimelineReminder };

export function Timeline({
  bookings,
  reminders,
  artists,
  timezone,
}: {
  bookings: TimelineBooking[];
  reminders: TimelineReminder[];
  artists: Artist[];
  timezone: string;
}) {
  const when = (iso: string) =>
    new Date(iso).toLocaleString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: timezone,
    });

  const items: Item[] = [
    ...bookings.map((b) => ({ kind: "booking" as const, at: b.starts_at, booking: b })),
    // A reminder is placed when it went, or when it was due if it has not.
    ...reminders.map((r) => ({
      kind: "reminder" as const,
      at: r.sent_at ?? r.due_at,
      reminder: r,
    })),
  ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

  if (items.length === 0) {
    return <p className="hint">Nothing yet.</p>;
  }

  return (
    <ol className="relative space-y-4 border-l border-border pl-4">
      {items.map((item) => {
        if (item.kind === "reminder") {
          const r = item.reminder;
          const failed = r.status === "failed" || Boolean(r.error);
          const sent = Boolean(r.sent_at);

          return (
            <li key={`r-${r.id}`} className="relative">
              <span
                className={`absolute -left-[21px] top-1.5 size-2 rounded-full ring-2 ring-surface ${
                  failed ? "bg-bad" : sent ? "bg-ok" : "bg-muted/50"
                }`}
                aria-hidden
              />
              <div className="text-sm">
                {failed
                  ? "Reminder failed"
                  : sent
                    ? `Reminder sent${r.channel ? ` by ${r.channel}` : ""}`
                    : "Reminder due"}
              </div>
              <div className="hint num">{when(item.at)}</div>

              {/* What actually went out, not what the template says now. */}
              {r.body && (
                <p className="mt-1 line-clamp-3 rounded-lg bg-surface-2/60 px-2.5 py-1.5 text-xs leading-relaxed text-muted">
                  {r.body}
                </p>
              )}
              {r.error && <p className="mt-1 text-xs text-bad">{r.error}</p>}
            </li>
          );
        }

        const b = item.booking;
        const artist = artists.find((a) => a.id === b.artist_id);
        const noShow = b.attended === false;

        return (
          <li key={`b-${b.id}`} className="relative">
            <span
              className={`absolute -left-[22px] top-1 size-2.5 rounded-full ring-2 ring-surface ${
                b.cancelled_at ? "bg-muted/40" : noShow ? "bg-warn" : "bg-accent"
              }`}
              aria-hidden
            />
            <div
              className={`text-sm font-medium ${b.cancelled_at ? "text-muted line-through" : ""}`}
            >
              {when(b.starts_at)}
            </div>
            <div className="hint">
              {b.cancelled_at ? "Cancelled" : noShow ? "Did not turn up" : b.type}
              {artist ? ` · ${artist.name}` : ""}
              {b.deposit_amount_pence
                ? ` · ${formatPence(b.deposit_amount_pence)} ${b.deposit_status}`
                : ""}
              {ranFor(b)}
            </div>

            {/*
              * The note from whoever closed it off.
              *
              * This is the screen the promise was made to: the diary says a
              * note is "for you and whoever has them next", and whoever has
              * them next is looking at this page. Without it the note was
              * written into a column nobody could read.
              */}
            {b.outcome_note && (
              <div className="hint mt-0.5 italic">{b.outcome_note}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
