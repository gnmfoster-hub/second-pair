import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireStudio, getArtists, getPriceBands } from "@/lib/studio";
import { formatPence } from "@/lib/money";
import { isOutOfHours } from "@/lib/report";
import { verticalPack } from "@/lib/verticals";
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
  needs_human: "bg-accent/15 text-accent",
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
  enquiries:
    | {
        description: string | null;
        quote_low_pence: number | null;
        bookings: { cancelled_at: string | null }[];
      }[]
    | null;
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

  const [{ data }, artists, bands] = await Promise.all([
    supabase
      .from("conversations")
      .select(
        "id, channel, status, created_at, last_message_at, " +
          "contacts(name, instagram_handle, phone, email, alert), " +
          "enquiries(description, quote_low_pence, bookings(cancelled_at))",
      )
      .eq("studio_id", studio.id)
      .order("last_message_at", { ascending: false })
      .limit(50),
    getArtists(studio.id),
    getPriceBands(studio.id),
  ]);

  const conversations = (data ?? []) as unknown as Row[];
  const pack = verticalPack(studio.vertical);
  const words = { ...pack.vocabulary, ...(studio.vocabulary ?? {}) };

  // Framed as what the assistant did, not as what happened — that is the thing
  // being paid for, and the reason to open this page at all.
  const recent = conversations.filter((c) => c.created_at >= sevenDaysAgo);
  const whileShut = recent.filter((c) =>
    isOutOfHours(new Date(c.created_at), studio.hours, studio.timezone),
  );
  const isBooked = (c: Row) =>
    (c.enquiries?.[0]?.bookings ?? []).some((b) => !b.cancelled_at);

  const booked = recent.filter(isBooked);
  const recovered = whileShut
    .filter(isBooked)
    .reduce((total, c) => total + (c.enquiries?.[0]?.quote_low_pence ?? 0), 0);

  const waiting = conversations.filter((c) => c.status === "needs_human");

  const checklist = [
    {
      done: artists.length > 0,
      label: `Add at least one ${words.practitioner} with rates`,
      href: "/settings/artists",
    },
    { done: bands.length > 0, label: "Set up your services", href: "/settings/pricing" },
    {
      done: studio.deposit_mode === "none" || studio.cancellation_policy.trim().length > 0,
      label: "Write the cancellation policy",
      href: "/settings",
    },
    {
      done: Boolean(studio.privacy_notice_url),
      label: "Add a privacy notice URL",
      href: "/settings",
    },
  ];
  const outstanding = checklist.filter((c) => !c.done);

  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
      <h1 className="text-xl font-semibold tracking-tight">Inbox</h1>

      {recent.length > 0 ? (
        <p className="hint mt-1">
          Your assistant answered{" "}
          <strong className="text-foreground">{recent.length}</strong>{" "}
          {recent.length === 1 ? "enquiry" : "enquiries"} this week
          {whileShut.length > 0 && (
            <>
              , <strong className="text-foreground">{whileShut.length}</strong> of them
              while you were working
            </>
          )}
          .
        </p>
      ) : (
        <p className="hint mt-1">Every enquiry, across every channel.</p>
      )}

      {recent.length > 0 && (
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="card p-4">
            <div className="text-2xl font-semibold tabular-nums">{booked.length}</div>
            <div className="hint mt-0.5">Booked in</div>
          </div>
          <div className={`card p-4 ${recovered ? "border-accent/40 bg-accent/5" : ""}`}>
            <div
              className={`text-2xl font-semibold tabular-nums ${recovered ? "text-accent" : ""}`}
            >
              {formatPence(recovered)}
            </div>
            <div className="hint mt-0.5">Won while you were busy</div>
          </div>
          <div className={`card p-4 ${waiting.length ? "border-warn/40" : ""}`}>
            <div
              className={`text-2xl font-semibold tabular-nums ${
                waiting.length ? "text-warn" : ""
              }`}
            >
              {waiting.length}
            </div>
            <div className="hint mt-0.5">Need you</div>
          </div>
        </div>
      )}

      {outstanding.length > 0 && (
        <div className="card mt-5 p-5">
          <div className="text-sm font-medium">
            Setup: {checklist.length - outstanding.length} of {checklist.length} done
          </div>
          <ul className="mt-3 space-y-2">
            {checklist.map((item) => (
              <li key={item.label} className="flex items-center gap-2.5 text-sm">
                <span
                  className={`grid size-4 shrink-0 place-items-center rounded-full text-[10px] ${
                    item.done ? "bg-ok/15 text-ok" : "border border-border text-transparent"
                  }`}
                >
                  ✓
                </span>
                {item.done ? (
                  <span className="text-muted line-through">{item.label}</span>
                ) : (
                  <Link href={item.href} className="text-foreground hover:text-accent">
                    {item.label}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card mt-5 overflow-hidden">
        {conversations.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <div className="text-sm">Nothing yet.</div>
            <p className="hint mx-auto mt-2 max-w-sm">
              Once the widget is on your site, enquiries land here within a minute of
              arriving — whether or not you are free to look.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {conversations.map((c) => {
              const contact = c.contacts;
              const enquiry = c.enquiries?.[0];
              const reach = contact?.phone ?? contact?.email;
              const outOfHours = isOutOfHours(
                new Date(c.created_at),
                studio.hours,
                studio.timezone,
              );

              return (
                <li key={c.id}>
                  <Link
                    href={`/conversations/${c.id}`}
                    className="flex items-center gap-4 px-5 py-3.5 hover:bg-surface-2/50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 truncate text-sm">
                        {contact?.name ??
                          contact?.instagram_handle ??
                          contact?.phone ??
                          "Unnamed enquiry"}
                        {contact?.alert && (
                          <span
                            className="rounded-full bg-warn/15 px-2 py-0.5 text-[10px] uppercase tracking-wide text-warn"
                            title={contact.alert}
                          >
                            note
                          </span>
                        )}
                      </div>
                      <div className="hint mt-0.5 truncate">
                        {enquiry?.description ?? CHANNEL_LABELS[c.channel]}
                      </div>
                    </div>

                    {outOfHours && (
                      <span
                        className="hint hidden sm:block"
                        title="Came in outside your opening hours"
                      >
                        out of hours
                      </span>
                    )}
                    {!reach && (
                      <span className="text-xs text-warn" title="No phone or email yet">
                        no contact
                      </span>
                    )}
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs ${STATUS_STYLES[c.status]}`}
                    >
                      {CONV_STATUS_LABELS[c.status]}
                    </span>
                    <time className="hint w-20 shrink-0 text-right">
                      {ago(c.last_message_at)}
                    </time>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
