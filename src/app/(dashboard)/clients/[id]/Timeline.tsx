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
  /**
   * Whether this one is the booking confirmation rather than a reminder.
   *
   * A confirmation is a reminder template set to zero hours before — right in
   * the database and wrong on a screen a business reads. "Reminder sent" under
   * an appointment made two minutes ago is the kind of thing that makes
   * somebody doubt what else the page is telling them.
   */
  confirmation?: boolean;
  /**
   * Which of their templates wrote it, by the name they gave it.
   *
   * So "this one went out wrong" leads to the setting that says so. Null where
   * the template has since been deleted, which the column allows on purpose —
   * the record of what was sent outlives the thing that composed it.
   */
  template_label?: string | null;
};

/**
 * How long after it was due it actually went.
 *
 * Worth saying out loud on the record, because it is rarely nothing. The sweep
 * that sends these is driven by a schedule GitHub throttles to every few
 * hours, so a reminder due at nine can go at eleven — and the person it
 * answers is the customer saying "this arrived at a funny time", which nobody
 * could check before.
 *
 * Silent under a quarter of an hour: a reminder is due within a window rather
 * than to the second, and a line reading "3 minutes later than due" on every
 * row is noise on every row.
 */
function lateness(due: string, sent: string | null): string {
  if (!sent) return "";
  const minutes = Math.round((Date.parse(sent) - Date.parse(due)) / 60_000);
  if (!Number.isFinite(minutes) || minutes < 15) return "";
  if (minutes < 90) return `${minutes} minutes after it was due`;

  const hours = Math.round(minutes / 60);
  if (hours < 36) return `${hours} hours after it was due`;
  return `${Math.round(hours / 24)} days after it was due`;
}

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

          /*
           * Three states, not two. Skipped is not failed.
           *
           * This read "failed if the status says so, or if there is anything
           * in the error column", which was a fair proxy while the only thing
           * that ever wrote to that column was a failure. Then the sender
           * started recording *why* it skipped one — genuinely useful, since a
           * cancelled appointment and somebody who texted STOP are different
           * problems with different answers — and every ordinary skip began
           * showing on a client's timeline as a red "Reminder failed".
           *
           * Nothing had gone wrong in any of them. A business reading its own
           * client list would think its reminders were broken.
           */
          const failed = r.status === "failed";
          const skipped = r.status === "skipped";
          const sent = Boolean(r.sent_at);

          /*
           * Every channel it went on, and which of them the wording below is.
           *
           * A reminder sent on both is one row with "email, sms" in the
           * channel column and one body — the first channel's. The wordings
           * differ: an email carries the whole message and a text is cut to
           * one. Showing one under a heading that names two reads as though
           * both said this, so it says which one it is.
           */
          const channels = (r.channel ?? "")
            .split(",")
            .map((c) => c.trim())
            .filter(Boolean);
          const late = lateness(r.due_at, r.sent_at);

          return (
            <li key={`r-${r.id}`} className="relative">
              <span
                className={`absolute -left-[21px] top-1.5 size-2 rounded-full ring-2 ring-surface ${
                  failed ? "bg-bad" : sent ? "bg-ok" : "bg-muted/50"
                }`}
                aria-hidden
              />

              {/*
                * Open it and read the whole thing.
                *
                * Giles: when the reminders are captured on the client page, can
                * they be clicked on and looked at if required. They could not —
                * the wording was cut to three lines with no way to see the rest,
                * and everything else about the send was in columns this page
                * read and never showed.
                *
                * A details rather than a dialog: it is a record, not a task, and
                * the answer to "what did they actually get" should be one click
                * away on the page you are already reading rather than a screen
                * you have to come back from. No JavaScript either, so it works
                * the same on a phone with a bad signal.
                */}
              <details className="group">
                <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                  <div className="text-sm">
                    {/* The same four states, named for what this one actually is. */}
                    {(() => {
                      const what = r.confirmation ? "Confirmation" : "Reminder";
                      if (failed) return `${what} failed`;
                      if (sent) return `${what} sent${r.channel ? ` by ${r.channel}` : ""}`;
                      if (skipped) return `${what} not sent`;
                      return r.confirmation ? "Confirmation due" : "Reminder due";
                    })()}
                    <span className="hint ml-1.5 group-open:hidden">· read it</span>
                  </div>
                  <div className="hint num">{when(item.at)}</div>

                  {/* What actually went out, not what the template says now. */}
                  {r.body && (
                    <p className="mt-1 line-clamp-3 rounded-lg bg-surface-2/60 px-2.5 py-1.5 text-xs leading-relaxed text-muted group-open:hidden">
                      {r.body}
                    </p>
                  )}
                </summary>

                <div className="mt-1.5 space-y-2 rounded-lg bg-surface-2/60 px-2.5 py-2">
                  {r.body ? (
                    <p className="whitespace-pre-wrap text-xs leading-relaxed text-foreground">
                      {r.body}
                    </p>
                  ) : (
                    <p className="hint text-xs">
                      Nothing was composed for this one, so there is no wording to show.
                    </p>
                  )}

                  {/* A hairline, because the wording and the facts about it ran
                      together as one block of text and read as one thing. */}
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 border-t border-border/60 pt-2 text-xs text-muted">
                    <dt>Due</dt>
                    <dd className="num text-foreground">{when(r.due_at)}</dd>

                    {r.sent_at && (
                      <>
                        <dt>Sent</dt>
                        <dd className="num text-foreground">
                          {when(r.sent_at)}
                          {late && <span className="text-muted"> · {late}</span>}
                        </dd>
                      </>
                    )}

                    {channels.length > 0 && (
                      <>
                        <dt>{channels.length > 1 ? "Went on" : "Went by"}</dt>
                        <dd className="text-foreground">
                          {channels.join(", ")}
                          {channels.length > 1 && (
                            <span className="text-muted">
                              {" "}
                              · the wording above is the {channels[0]} one
                            </span>
                          )}
                        </dd>
                      </>
                    )}

                    {r.template_label && (
                      <>
                        <dt>From</dt>
                        <dd className="text-foreground">{r.template_label}</dd>
                      </>
                    )}
                  </dl>

                  {/* Red only when something actually went wrong; a reason why
                      one was not sent is a note, not an alarm. */}
                  {r.error && (
                    <p className={`text-xs ${failed ? "text-bad" : "text-muted"}`}>{r.error}</p>
                  )}
                </div>
              </details>
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
