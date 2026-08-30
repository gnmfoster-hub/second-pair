import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireStudio, getArtists } from "@/lib/studio";
import { formatPence } from "@/lib/money";
import { CHANNEL_LABELS, CONV_STATUS_LABELS, type Channel, type ConvStatus } from "@/lib/types";
import { ClientForm } from "./ClientForm";

type ContactRow = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  alert: string | null;
  marketing_consent: boolean;
  channel: Channel;
  created_at: string;
  conversations: {
    id: string;
    channel: Channel;
    status: ConvStatus;
    created_at: string;
    last_message_at: string;
    enquiries: {
      description: string | null;
      quote_low_pence: number | null;
      bookings: Booking[];
    } | null;
  }[];
};

type Booking = {
  id: string;
  artist_id: string;
  starts_at: string;
  type: string;
  deposit_amount_pence: number;
  deposit_status: string;
  cancelled_at: string | null;
  attended: boolean | null;
};

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { studio } = await requireStudio();
  const supabase = await createClient();
  const artists = await getArtists(studio.id);

  const { data: contactRow } = await supabase
    .from("contacts")
    .select(
      "*, conversations(id, channel, status, created_at, last_message_at, " +
        "enquiries(description, quote_low_pence, quote_high_pence, bookings(*)))",
    )
    .eq("id", id)
    .eq("studio_id", studio.id)
    .maybeSingle();

  const contact = contactRow as unknown as ContactRow | null;
  if (!contact) notFound();

  const conversations = contact.conversations ?? [];

  const bookings = conversations
    .flatMap((c) => c.enquiries?.bookings ?? [])
    .sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at));

  const live = bookings.filter((b) => !b.cancelled_at);
  const paid = live
    .filter((b) => b.deposit_status === "paid")
    .reduce((t, b) => t + b.deposit_amount_pence, 0);
  const noShows = bookings.filter((b) => b.attended === false).length;

  const when = (iso: string) =>
    new Date(iso).toLocaleString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: studio.timezone,
    });

  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
      <Link href="/clients" className="hint hover:text-foreground">
        ← Clients
      </Link>

      <h1 className="mt-3 text-xl font-semibold tracking-tight">
        {contact.name ?? contact.phone ?? "Unnamed client"}
      </h1>
      <p className="hint mt-1">
        First in touch{" "}
        {new Date(contact.created_at).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })}{" "}
        · {CHANNEL_LABELS[contact.channel]}
      </p>

      {contact.alert && (
        <div className="mt-4 rounded-lg border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">
          {contact.alert}
        </div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="card p-4">
          <div className="text-2xl font-semibold tabular-nums">{live.length}</div>
          <div className="hint mt-0.5">Appointments</div>
        </div>
        <div className="card p-4">
          <div className="text-2xl font-semibold tabular-nums">{formatPence(paid)}</div>
          <div className="hint mt-0.5">Deposits paid</div>
        </div>
        <div className={`card p-4 ${noShows ? "border-warn/40" : ""}`}>
          <div className={`text-2xl font-semibold tabular-nums ${noShows ? "text-warn" : ""}`}>
            {noShows}
          </div>
          <div className="hint mt-0.5">No-shows</div>
        </div>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_18rem]">
        <div className="min-w-0 space-y-6">
          <ClientForm
            client={{
              id: contact.id,
              name: contact.name,
              phone: contact.phone,
              email: contact.email,
              notes: contact.notes,
              alert: contact.alert,
              marketing_consent: contact.marketing_consent,
            }}
          />
        </div>

        <aside className="space-y-6">
          <section className="card p-5">
            <h2 className="mb-3 text-sm font-medium">History</h2>
            {bookings.length === 0 && conversations.length === 0 && (
              <p className="hint">Nothing yet.</p>
            )}

            <ul className="space-y-3">
              {bookings.map((b) => {
                const artist = artists.find((a) => a.id === b.artist_id);
                return (
                  <li key={b.id} className="text-sm">
                    <div className={b.cancelled_at ? "text-muted line-through" : ""}>
                      {when(b.starts_at)}
                    </div>
                    <div className="hint">
                      {b.type}
                      {artist ? ` · ${artist.name}` : ""}
                      {b.deposit_amount_pence
                        ? ` · ${formatPence(b.deposit_amount_pence)} ${b.deposit_status}`
                        : ""}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="card p-5">
            <h2 className="mb-3 text-sm font-medium">Conversations</h2>
            <ul className="space-y-2">
              {conversations
                .sort((a, b) => Date.parse(b.last_message_at) - Date.parse(a.last_message_at))
                .map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/conversations/${c.id}`}
                      className="block text-sm hover:text-accent"
                    >
                      <span className="truncate">
                        {c.enquiries?.description ?? CONV_STATUS_LABELS[c.status]}
                      </span>
                      <span className="hint block">
                        {new Date(c.last_message_at).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                        })}{" "}
                        · {CONV_STATUS_LABELS[c.status]}
                      </span>
                    </Link>
                  </li>
                ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
