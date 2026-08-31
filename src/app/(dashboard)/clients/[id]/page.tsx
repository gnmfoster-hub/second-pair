import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireStudio, getArtists } from "@/lib/studio";
import { formatPence } from "@/lib/money";
import { Timeline, type TimelineReminder } from "./Timeline";
import { CHANNEL_LABELS, CONV_STATUS_LABELS, type Channel, type ConvStatus } from "@/lib/types";
import { ClientForm } from "./ClientForm";
import { MessageClient } from "./MessageClient";
import { routesFor } from "@/lib/messaging/reach";
import { connectedChannels } from "@/lib/messaging/connections";
import { canMessage } from "@/lib/permissions";

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
    external_ref: string | null;
    last_inbound_at: string | null;
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

export default async function ClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  /** `found` is set when adding a client landed on somebody who already existed. */
  searchParams: Promise<{ found?: string }>;
}) {
  const { id } = await params;
  const { found } = await searchParams;
  const { studio } = await requireStudio();
  const supabase = await createClient();
  const artists = await getArtists(studio.id);

  const { data: contactRow } = await supabase
    .from("contacts")
    .select(
      "*, conversations(id, channel, status, created_at, last_message_at, "
        + "external_ref, last_inbound_at, " +
        "enquiries(description, quote_low_pence, quote_high_pence, bookings(*)))",
    )
    .eq("id", id)
    .eq("studio_id", studio.id)
    .maybeSingle();

  const contact = contactRow as unknown as ContactRow | null;
  if (!contact) notFound();

  // Bookings typed straight into the diary and attached to this person. They
  // have no conversation to hang off, so they are fetched separately.
  const { data: direct } = await supabase
    .from("bookings")
    .select("*")
    .eq("contact_id", id);

  const conversations = contact.conversations ?? [];

  // Bookings reach a client two ways: through a conversation, or attached
  // directly when somebody typed them into the diary.
  const bookings = [
    ...conversations.flatMap((c) => c.enquiries?.bookings ?? []),
    ...(direct ?? []),
  ]
    .sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at));

  /*
   * What was actually sent to this person.
   *
   * The reminders table has always recorded the rendered body, the channel and
   * any error — it simply never reached a screen, so "I never got a reminder"
   * was unanswerable.
   */
  const { data: reminders } = bookings.length
    ? await supabase
        .from("reminders")
        .select("id, booking_id, due_at, sent_at, status, channel, body, error")
        .in(
          "booking_id",
          bookings.map((b) => b.id),
        )
        .order("due_at", { ascending: false })
    : { data: [] };

  /*
   * Whether this person can be messaged, and on what.
   *
   * Worked out here so the page can say why not before anybody types. The
   * action works it out again on the way through — this is for the screen,
   * not for the decision.
   */
  const routes = routesFor({
    conversations,
    phone: contact.phone,
    connected: await connectedChannels(supabase, studio.id),
  });
  const mayMessage = await canMessage();

  const live = bookings.filter((b) => !b.cancelled_at);
  const paid = live
    .filter((b) => b.deposit_status === "paid")
    .reduce((t, b) => t + b.deposit_amount_pence, 0);
  const noShows = bookings.filter((b) => b.attended === false).length;

  return (
    <div className="mx-auto max-w-4xl px-8 py-9">
      <Link href="/clients" className="hint hover:text-foreground">
        ← Clients
      </Link>

      {/*
       * Why you are looking at somebody you did not type.
       *
       * Adding a client who already exists takes you to them rather than
       * refusing. Silently is worse than not at all — you would think the name
       * you typed had been saved and it had not.
       */}
      {found && (
        <p className="mt-3 rounded-xl border border-border bg-surface-2/60 px-4 py-3 text-sm">
          You already had this client, so nothing was added. Their existing details
          are below.
        </p>
      )}

      <h1 className="page-title mt-3">
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
          <div className="stat">{live.length}</div>
          <div className="hint mt-0.5">Appointments</div>
        </div>
        <div className="card p-4">
          <div className="stat">{formatPence(paid)}</div>
          <div className="hint mt-0.5">Deposits paid</div>
        </div>
        <div className={`card p-4 ${noShows ? "border-warn/40" : ""}`}>
          <div className={`stat ${noShows ? "text-warn" : ""}`}>
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
          <MessageClient
            contactId={contact.id}
            name={contact.name ?? "them"}
            routes={routes}
            allowed={mayMessage}
          />

          <section className="card p-5">
            <h2 className="section-title mb-4 text-sm">History</h2>
            <Timeline
              bookings={bookings}
              reminders={(reminders ?? []) as TimelineReminder[]}
              artists={artists}
              timezone={studio.timezone}
            />
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
