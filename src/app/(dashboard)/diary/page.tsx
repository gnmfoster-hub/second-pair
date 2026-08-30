import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireStudio, getArtists } from "@/lib/studio";
import { formatPence } from "@/lib/money";
import { verticalPack } from "@/lib/verticals";
import { AddEntry, MoveEntry, CancelEntry } from "./DiaryForms";

type Row = {
  id: string;
  artist_id: string;
  type: "consultation" | "session";
  starts_at: string;
  ends_at: string;
  deposit_amount_pence: number;
  deposit_status: string;
  held_until: string | null;
  source: "assistant" | "manual" | "block";
  title: string | null;
  notes: string | null;
  enquiries: {
    description: string | null;
    placement: string | null;
    conversation_id: string;
    conversations: {
      contacts: { name: string | null; phone: string | null; email: string | null } | null;
    } | null;
  } | null;
};

const DEPOSIT_STYLES: Record<string, string> = {
  paid: "bg-ok/10 text-ok",
  link_sent: "bg-warn/10 text-warn",
  unpaid: "bg-warn/10 text-warn",
  refunded: "bg-surface-2 text-muted",
  forfeited: "bg-surface-2 text-muted",
};

const DEPOSIT_LABELS: Record<string, string> = {
  paid: "Deposit paid",
  link_sent: "Awaiting payment",
  unpaid: "No deposit yet",
  refunded: "Refunded",
  forfeited: "Forfeited",
};

export default async function DiaryPage() {
  const { studio } = await requireStudio();
  const supabase = await createClient();
  const artists = await getArtists(studio.id);

  // Trade vocabulary, same source the assistant speaks from: "artist" for a
  // tattoo studio, "stylist" for a salon, "engineer" for a trade.
  const pack = verticalPack(studio.vertical);
  const words = { ...pack.vocabulary, ...(studio.vocabulary ?? {}) };

  // Everything from the start of today onwards. Past appointments belong in a
  // history view, not the diary someone works from.
  const since = new Date();
  since.setHours(0, 0, 0, 0);

  const { data } = await supabase
    .from("bookings")
    .select(
      "id, artist_id, type, starts_at, ends_at, deposit_amount_pence, deposit_status, held_until, " +
        "source, title, notes, " +
        "enquiries(description, placement, conversation_id, conversations(contacts(name, phone, email)))",
    )
    .is("cancelled_at", null)
    .gte("starts_at", since.toISOString())
    .order("starts_at");

  const all = (data ?? []) as unknown as Row[];
  const mine = new Set(artists.map((a) => a.id));
  const bookings = all.filter((b) => mine.has(b.artist_id));

  const dayFormat = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: studio.timezone,
  });
  const timeFormat = new Intl.DateTimeFormat("en-GB", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: studio.timezone,
  });

  // Group by the day as the studio sees it, not as the server does.
  const days = new Map<string, Row[]>();
  for (const booking of bookings) {
    const key = dayFormat.format(new Date(booking.starts_at));
    days.set(key, [...(days.get(key) ?? []), booking]);
  }

  const todayKey = dayFormat.format(new Date());
  const appointments = bookings.filter((b) => b.source !== "block");
  const awaiting = appointments.filter(
    (b) => b.source === "assistant" && b.deposit_status !== "paid",
  ).length;

  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
      <h1 className="text-xl font-semibold tracking-tight">Diary</h1>
      <p className="hint mt-1">
        {appointments.length === 0
          ? "Nothing booked yet."
          : `${appointments.length} appointment${appointments.length === 1 ? "" : "s"} coming up` +
            (awaiting ? `, ${awaiting} still waiting on a deposit` : "")}
      </p>

      <div className="mt-6">
        <AddEntry artists={artists.filter((a) => a.active)} practitioner={words.practitioner} />
      </div>

      {bookings.length === 0 ? (
        <div className="card mt-6 px-5 py-14 text-center">
          <div className="text-sm">The diary is empty.</div>
          <p className="hint mx-auto mt-2 max-w-sm">
            Appointments the assistant books land here, alongside anything you add
            yourself. It only ever offers times this diary says are free.
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-8">
          {[...days.entries()].map(([day, rows]) => (
            <section key={day}>
              <h2 className="flex items-baseline gap-2 text-sm font-medium">
                {day}
                {day === todayKey && (
                  <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] uppercase tracking-wide text-accent">
                    Today
                  </span>
                )}
              </h2>

              <div className="card mt-3 divide-y divide-border overflow-hidden">
                {rows.map((booking) => {
                  const contact = booking.enquiries?.conversations?.contacts;
                  const artist = artists.find((a) => a.id === booking.artist_id);
                  const minutes = Math.round(
                    (Date.parse(booking.ends_at) - Date.parse(booking.starts_at)) / 60000,
                  );
                  const held =
                    booking.held_until && Date.parse(booking.held_until) > Date.now();
                  const isBlock = booking.source === "block";
                  const conversationId = booking.enquiries?.conversation_id;

                  const name =
                    booking.title ?? contact?.name ?? (isBlock ? "Unavailable" : "Unnamed");

                  return (
                    <div
                      key={booking.id}
                      className={`flex items-start gap-4 px-5 py-4 ${isBlock ? "bg-surface-2/30" : ""}`}
                    >
                      <div className="w-20 shrink-0">
                        <div className="text-sm tabular-nums">
                          {timeFormat.format(new Date(booking.starts_at))}
                        </div>
                        <div className="hint">{minutes} min</div>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm">
                          {conversationId ? (
                            <Link
                              href={`/conversations/${conversationId}`}
                              className="hover:text-accent"
                            >
                              {name}
                            </Link>
                          ) : (
                            <span className={isBlock ? "text-muted" : ""}>{name}</span>
                          )}
                          <span className="ml-2 text-muted">
                            {isBlock
                              ? "blocked out"
                              : booking.type === "consultation"
                                ? "consultation"
                                : "session"}
                            {artist ? ` · ${artist.name}` : ""}
                          </span>
                        </div>

                        {!isBlock && (
                          <div className="hint mt-0.5 truncate">
                            {booking.enquiries?.description ?? booking.notes ?? "No description"}
                            {booking.enquiries?.placement
                              ? ` · ${booking.enquiries.placement}`
                              : ""}
                          </div>
                        )}
                        {isBlock && booking.notes && (
                          <div className="hint mt-0.5 truncate">{booking.notes}</div>
                        )}
                        {contact?.phone && (
                          <div className="hint mt-0.5 tabular-nums">{contact.phone}</div>
                        )}

                        <div className="mt-2 flex flex-wrap items-center gap-3">
                          <MoveEntry
                            id={booking.id}
                            startsAt={booking.starts_at}
                            timezone={studio.timezone}
                          />
                          <CancelEntry id={booking.id} label={name} />
                        </div>
                      </div>

                      {!isBlock && (
                        <div className="shrink-0 text-right">
                          {booking.source === "assistant" ? (
                            <>
                              <span
                                className={`inline-block rounded-full px-2.5 py-1 text-xs ${
                                  DEPOSIT_STYLES[booking.deposit_status] ??
                                  "bg-surface-2 text-muted"
                                }`}
                              >
                                {DEPOSIT_LABELS[booking.deposit_status] ??
                                  booking.deposit_status}
                              </span>
                              <div className="hint mt-1">
                                {formatPence(booking.deposit_amount_pence)}
                              </div>
                              {held && (
                                <div className="hint text-warn">
                                  held till{" "}
                                  {timeFormat.format(new Date(booking.held_until as string))}
                                </div>
                              )}
                            </>
                          ) : (
                            <span className="hint">added by you</span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
