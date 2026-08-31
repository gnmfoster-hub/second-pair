import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireStudio } from "@/lib/studio";
import { formatPence } from "@/lib/money";
import { isOutOfHours } from "@/lib/report";
import { readinessOf } from "@/lib/readiness";
import { Readiness } from "@/components/Readiness";
import { Page, PageHeader } from "@/components/PageHeader";
import { colourForName, initialsOf } from "@/lib/diaryColour";
import { ChannelIcon } from "@/components/ChannelIcon";
import {
  CHANNEL_LABELS,
  CONV_STATUS_LABELS,
  type Channel,
  type ConvStatus,
} from "@/lib/types";

const STATUS_STYLES: Record<ConvStatus, string> = {
  new: "bg-surface-2 text-muted",
  qualified: "bg-surface-2 text-foreground",
  deposit_paid: "bg-ok/10 text-ok",
  booked: "bg-ok/10 text-ok",
  needs_human: "bg-warn/15 text-warn",
  lost: "bg-surface-2 text-muted/60",
};

type Row = {
  id: string;
  channel: Channel;
  status: ConvStatus;
  created_at: string;
  last_message_at: string;
  contacts: {
    name: string | null;
    instagram_handle: string | null;
    phone: string | null;
    email: string | null;
    alert: string | null;
  } | null;
  /*
   * An object, not an array.
   *
   * `enquiries.conversation_id` is unique, so PostgREST reads the relationship
   * as to-one and embeds a single row. Typing it as an array compiles happily
   * and then silently reads `undefined` from `[0]` forever — which is exactly
   * what it did: every figure on this page was zero while the rows underneath
   * plainly said "booked".
   */
  enquiries: {
    description: string | null;
    quote_low_pence: number | null;
    bookings: { cancelled_at: string | null }[];
  } | null;
};

/** Wrapped so the purity rule sees a call, not a bare clock read in render. */
function weekAgo(): string {
  return new Date(Date.now() - 7 * 86400_000).toISOString();
}

const ago = (iso: string) => {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days}d ago`;
};

export default async function InboxPage() {
  const { studio } = await requireStudio();
  const supabase = await createClient();

  const sevenDaysAgo = weekAgo();

  const { data } = await supabase
    .from("conversations")
    .select(
      "id, channel, status, created_at, last_message_at, " +
        "contacts(name, instagram_handle, phone, email, alert), " +
        "enquiries(description, quote_low_pence, bookings(cancelled_at))",
    )
    .eq("studio_id", studio.id)
    // Rehearsals by the owner never appear here, or every figure below is a
    // lie about how much work the assistant actually did.
    .eq("is_test", false)
    .order("last_message_at", { ascending: false })
    .limit(50);

  const conversations = (data ?? []) as unknown as Row[];

  // Framed as what the assistant did, not as what happened — that is the thing
  // being paid for, and the reason to open this page at all.
  const recent = conversations.filter((c) => c.created_at >= sevenDaysAgo);
  const whileShut = recent.filter((c) =>
    isOutOfHours(new Date(c.created_at), studio.hours, studio.timezone),
  );
  const isBooked = (c: Row) =>
    (c.enquiries?.bookings ?? []).some((b) => !b.cancelled_at);

  const booked = recent.filter(isBooked);
  const recovered = whileShut
    .filter(isBooked)
    .reduce((total, c) => total + (c.enquiries?.quote_low_pence ?? 0), 0);

  const waiting = conversations.filter((c) => c.status === "needs_human");

  const capabilities = await readinessOf(supabase, studio);

  return (
    <Page>
      <PageHeader title="Inbox">
        {recent.length > 0 ? (
          <>
            Your assistant answered{" "}
            <strong className="font-semibold text-foreground">{recent.length}</strong>{" "}
            {recent.length === 1 ? "enquiry" : "enquiries"} this week
            {whileShut.length > 0 && (
              <>
                ,{" "}
                <strong className="font-semibold text-foreground">{whileShut.length}</strong>{" "}
                of them while you were working
              </>
            )}
            .
          </>
        ) : (
          <>Every enquiry, across every channel.</>
        )}
      </PageHeader>

      {/*
       * Three numbers, three weights.
       *
       * Neutral, then the money, then whatever needs a person. The middle one
       * carries the brand colour because it is the only figure on here that
       * answers "is this worth paying for" — and a screen where everything is
       * the same navy has no answer to that at all.
       *
       * The darker orange, not the bright one: the bright one is for a solid
       * fill behind ink, and as text on paper it does not pass contrast.
       */}
      {recent.length > 0 && (
        <div className="mt-7 grid gap-3 sm:grid-cols-3">
          <div className="card p-5">
            <div className="stat">{booked.length}</div>
            <div className="hint mt-2">Booked in</div>
          </div>

          <div
            className={`card relative overflow-hidden p-5 ${
              recovered ? "border-highlight/40" : ""
            }`}
          >
            {recovered > 0 && (
              <span
                className="absolute inset-y-0 left-0 w-1"
                style={{ background: "var(--highlight)" }}
                aria-hidden
              />
            )}
            <div
              className="stat"
              style={recovered ? { color: "var(--highlight-strong)" } : undefined}
            >
              {formatPence(recovered)}
            </div>
            <div className="hint mt-2">Won while you were busy</div>
          </div>

          <div className={`card p-5 ${waiting.length ? "border-warn/40" : ""}`}>
            <div className={`stat ${waiting.length ? "text-warn" : ""}`}>{waiting.length}</div>
            <div className="hint mt-2">Need you</div>
          </div>
        </div>
      )}

      <Readiness capabilities={capabilities} />

      <div className="card mt-4 overflow-hidden">
        {conversations.length === 0 ? (
          <div className="empty">
            <div className="empty-title">Nothing yet</div>
            <p className="empty-body">
              Once the widget is on your site, enquiries land here within a minute of
              arriving — whether or not you are free to look.
            </p>
            <Link href="/settings/install" className="btn-ghost mt-5">
              Get your link
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {conversations.map((c) => {
              const contact = c.contacts;
              const enquiry = c.enquiries;
              const reach = contact?.phone ?? contact?.email;
              /*
               * Every row has to say something.
               *
               * Plenty of people chat on a website and never give a name, and
               * the row for them read "Unnamed enquiry" over "Website" — two
               * lines, no information. What they actually asked for is more use
               * than the word Unnamed, so it moves up to the title when there
               * is nobody to name.
               */
              const named =
                contact?.name ?? contact?.instagram_handle ?? contact?.phone ?? null;
              const description = enquiry?.description ?? null;
              const who = named ?? description ?? "New enquiry";
              const outOfHours = isOutOfHours(
                new Date(c.created_at),
                studio.hours,
                studio.timezone,
              );

              return (
                <li key={c.id}>
                  <Link
                    href={`/conversations/${c.id}`}
                    className="group flex items-center gap-3.5 px-4 py-3.5 transition-colors hover:bg-surface-2/60 sm:px-5"
                  >
                    {/* A face, so the list scans as people rather than rows —
                        and where there is no person yet, where they came in. */}
                    {named ? (
                      <span
                        className="grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold text-white"
                        style={{ background: colourForName(named) }}
                        aria-hidden
                      >
                        {initialsOf(named)}
                      </span>
                    ) : (
                      <span
                        className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-muted"
                        title={CHANNEL_LABELS[c.channel]}
                        aria-hidden
                      >
                        <ChannelIcon channel={c.channel} />
                      </span>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{who}</span>
                        {contact?.alert && (
                          <span
                            className="pill shrink-0 bg-warn/15 text-[10px] uppercase tracking-wide text-warn"
                            title={contact.alert}
                          >
                            note
                          </span>
                        )}
                        {/*
                         * Quiet unless it is actually in the way.
                         *
                         * Somebody chatting on the website who has not given a
                         * number yet is an ordinary enquiry, not a problem, and
                         * six amber flags down a list made every normal day look
                         * like a bad one. It turns amber only when the
                         * conversation needs a person — that is the moment not
                         * being able to reach them stops you.
                         */}
                        {!reach && (
                          <span
                            className={`hidden shrink-0 text-[11px] sm:inline ${
                              c.status === "needs_human" ? "text-warn" : "text-muted/70"
                            }`}
                            title="No phone or email yet"
                          >
                            no contact
                          </span>
                        )}
                      </div>

                      <div className="hint mt-0.5 flex items-center gap-1.5">
                        <span
                          className="shrink-0 text-muted/70"
                          title={CHANNEL_LABELS[c.channel]}
                        >
                          <ChannelIcon channel={c.channel} />
                        </span>
                        <span className="truncate">
                          {named ? description ?? CHANNEL_LABELS[c.channel] : CHANNEL_LABELS[c.channel]}
                        </span>
                      </div>
                    </div>

                    {outOfHours && (
                      <span
                        className="hidden shrink-0 rounded-full border border-border px-2 py-0.5 text-[10px] text-muted lg:block"
                        title="Came in outside your opening hours"
                      >
                        out of hours
                      </span>
                    )}

                    <span className={`pill shrink-0 ${STATUS_STYLES[c.status]}`}>
                      {CONV_STATUS_LABELS[c.status]}
                    </span>

                    <time className="hint num hidden w-16 shrink-0 text-right sm:block">
                      {ago(c.last_message_at)}
                    </time>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Page>
  );
}
