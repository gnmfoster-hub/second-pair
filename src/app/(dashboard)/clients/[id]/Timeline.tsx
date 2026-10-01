import { formatPence } from "@/lib/money";
import { howTheyWent } from "@/lib/howTheyWent";
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
 *
 * ── Shortened on 1 October ───────────────────────────────────────────────────
 *
 * Giles: "history and planned reminders etc in customer record take up too much
 * of the page." They did, and the arithmetic says why: every booking carries a
 * confirmation and a reminder or two, so two rows in three were a message about
 * a booking rather than a booking, all of them peers in one flat list. A client
 * who had been in a dozen times filled the screen three times over, and the
 * thing somebody opens this page for — when were they last in, what happened —
 * was somewhere down the third screenful.
 *
 * So the shape now says what belongs to what. A booking is a row; its messages
 * sit underneath it, folded, with a line saying how they went. Bookings past
 * the most recent few fold away as well. Nothing was removed — every word is
 * still one click from where it was.
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
  /**
   * Every channel it went on, where there was more than one.
   *
   * Kept apart from channel because that column is the channel enum and a list
   * is not a channel — the sender spent a fortnight writing "email, sms" into
   * it, which Postgres refused along with the whole update. Null on every row
   * written before 1 October, and on every single-channel send since.
   */
  went_on?: string | null;
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

/** How many of the most recent entries stay open. The rest fold. */
const OPEN_AT_FIRST = 4;

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

  /*
   * Each booking's messages, gathered under it.
   *
   * Oldest first within a booking, because they are a sequence: the
   * confirmation when it was made, then the reminder the day before. Read
   * downwards they are the story of one appointment, which is the opposite
   * order to the list they sit in — that one is newest first, because read
   * downwards it is the story of a customer.
   */
  const itsMessages = new Map<string, TimelineReminder[]>();
  for (const r of reminders) {
    const already = itsMessages.get(r.booking_id);
    if (already) already.push(r);
    else itsMessages.set(r.booking_id, [r]);
  }
  for (const list of itsMessages.values()) {
    list.sort((a, b) => Date.parse(a.due_at) - Date.parse(b.due_at));
  }

  /*
   * A reminder whose booking is not on this page still gets a row of its own.
   *
   * The page asks for a limited number of recent bookings, so a reminder can
   * outlive its booking's place in the list, and marketing sends are recorded
   * the same way with nothing to sit under at all. Folding something under a
   * parent that is not there is how records quietly stop being shown.
   */
  const shown = new Set(bookings.map((b) => b.id));

  const items: Item[] = [
    ...bookings.map((b) => ({ kind: "booking" as const, at: b.starts_at, booking: b })),
    ...reminders
      .filter((r) => !shown.has(r.booking_id))
      .map((r) => ({
        kind: "reminder" as const,
        at: r.sent_at ?? r.due_at,
        reminder: r,
      })),
  ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

  if (items.length === 0) {
    return <p className="hint">Nothing yet.</p>;
  }

  const row = (item: Item) =>
    item.kind === "reminder" ? (
      <ReminderRow key={`r-${item.reminder.id}`} r={item.reminder} when={when} />
    ) : (
      <BookingRow
        key={`b-${item.booking.id}`}
        b={item.booking}
        artist={artists.find((a) => a.id === item.booking.artist_id)}
        messages={itsMessages.get(item.booking.id) ?? []}
        when={when}
      />
    );

  const first = items.slice(0, OPEN_AT_FIRST);
  const earlier = items.slice(OPEN_AT_FIRST);

  return (
    <>
      <ol className="relative space-y-4 border-l border-border pl-4">
        {first.map(row)}
      </ol>

      {earlier.length > 0 && (
        <details className="group/earlier mt-3">
          <summary className="cursor-pointer list-none text-sm text-muted hover:text-foreground [&::-webkit-details-marker]:hidden">
            <span className="group-open/earlier:hidden">
              Show {earlier.length} earlier
              {earlier.length === 1 ? " entry" : " entries"}
            </span>
            <span className="hidden group-open/earlier:inline">Hide the earlier ones</span>
          </summary>
          <ol className="relative mt-4 space-y-4 border-l border-border pl-4">
            {earlier.map(row)}
          </ol>
        </details>
      )}
    </>
  );
}

/**
 * One booking, with whatever was sent about it underneath.
 *
 * The booking's own facts stay on the page unfolded: this is what the page is
 * read for. What went out about it is one line until asked for.
 */
function BookingRow({
  b,
  artist,
  messages,
  when,
}: {
  b: TimelineBooking;
  artist: Artist | undefined;
  messages: TimelineReminder[];
  when: (iso: string) => string;
}) {
  const noShow = b.attended === false;
  const went = messages.length > 0 ? howTheyWent(messages) : null;

  return (
    <li className="relative">
      <span
        className={`absolute -left-[22px] top-1 size-2.5 rounded-full ring-2 ring-surface ${
          b.cancelled_at ? "bg-muted/40" : noShow ? "bg-warn" : "bg-accent"
        }`}
        aria-hidden
      />
      <div className={`text-sm font-medium ${b.cancelled_at ? "text-muted line-through" : ""}`}>
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
      {b.outcome_note && <div className="hint mt-0.5 italic">{b.outcome_note}</div>}

      {/*
        * What was sent about this booking, folded.
        *
        * Open already when one of them failed. A fold is a promise that
        * nothing behind it needs attention, and a reminder that did not reach
        * somebody is exactly the thing this page exists to answer — hiding it
        * one click deeper would be worse than the long page it replaced.
        */}
      {went && (
        <details open={went.bad} className="group/msgs mt-1.5">
          <summary className="cursor-pointer list-none text-xs text-muted hover:text-foreground [&::-webkit-details-marker]:hidden">
            <span className={went.bad ? "text-bad" : ""}>{went.label}</span>
            <span className="ml-1.5 group-open/msgs:hidden">· read them</span>
          </summary>
          <ol className="relative mt-2 space-y-2 border-l border-border/60 pl-4">
            {messages.map((r) => (
              <ReminderRow key={`r-${r.id}`} r={r} when={when} />
            ))}
          </ol>
        </details>
      )}
    </li>
  );
}

/**
 * One reminder, as a line that opens.
 *
 * Lifted out of the timeline on 1 October when reminders stopped being peers
 * of bookings and became something folded underneath one.
 *
 * Nothing about what it shows changed. Every decision in here was paid for
 * once already — three states rather than two, so a skip is not reported as a
 * failure; what actually went out rather than what the template says now; and
 * the wording folded away until somebody asks for it.
 */
function ReminderRow({
  r,
  when,
}: {
  r: TimelineReminder;
  when: (iso: string) => string;
}) {
  const at = r.sent_at ?? r.due_at;

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
  const channels = (r.went_on ?? r.channel ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  const late = lateness(r.due_at, r.sent_at);

  return (
    <li className="relative">
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
      <details className="group/one">
        <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
          <div className="text-sm">
            {/* The same four states, named for what this one actually is. */}
            {(() => {
              const what = r.confirmation ? "Confirmation" : "Reminder";
              if (failed) return `${what} failed`;
              const by = r.went_on ?? r.channel;
              if (sent) return `${what} sent${by ? ` by ${by}` : ""}`;
              if (skipped) return `${what} not sent`;
              return r.confirmation ? "Confirmation due" : "Reminder due";
            })()}
            <span className="hint ml-1.5 group-open/one:hidden">· read it</span>
          </div>
          <div className="hint num">{when(at)}</div>

          {/* What actually went out, not what the template says now. Three
              lines of it, which costs nothing while the group above is folded
              and means opening a booking's messages shows the gist of each
              without opening every one of them. */}
          {r.body && (
            <p className="mt-1 line-clamp-3 rounded-lg bg-surface-2/60 px-2.5 py-1.5 text-xs leading-relaxed text-muted group-open/one:hidden">
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
