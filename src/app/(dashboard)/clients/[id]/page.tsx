import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { describeFact, type TradeFact } from "@/lib/tradeFacts";
import { verticalPack } from "@/lib/verticals";
import { requireStudio, getArtists } from "@/lib/studio";
import { payableFor } from "@/lib/payments/whoTakes";
import { formatPence } from "@/lib/money";
import { Timeline, type TimelineReminder } from "./Timeline";
import { CHANNEL_LABELS, CONV_STATUS_LABELS, type Channel, type ConvStatus } from "@/lib/types";
import { ClientForm } from "./ClientForm";
import { siteOrigin } from "@/lib/origin";
import { MessageClient } from "./MessageClient";
import { fillFor } from "@/lib/quickMessages";
import { routesFor } from "@/lib/messaging/reach";
import { connectedChannels } from "@/lib/messaging/connections";
import { canMessage } from "@/lib/permissions";
import { Forget } from "./Forget";
import { FormsPanel } from "./FormsPanel";
import { whoseClient } from "@/lib/whoseClient";
import { Timings, type ClientTiming } from "./Timings";
import type { Service } from "@/lib/types";
import { Bought, type Purchase } from "./Bought";
import { hasColumn } from "@/lib/db/hasColumn";
import { AskForPayment } from "@/components/AskForPayment";
import { wordsFor } from "@/lib/words";

type ContactRow = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  alert: string | null;
  marketing_consent: boolean;
  /** Absent until the trade-facts migration runs; then the pack's own fields. */
  trade_facts?: Record<string, unknown> | null;
  marketing_email?: boolean | null;
  marketing_sms?: boolean | null;
  marketing_token?: string | null;
  /** Absent until the migration runs, which reads as "agreed, date unknown". */
  marketing_consent_at?: string | null;
  marketing_consent_source?: string | null;
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
    artist_id: string | null;
    enquiries: {
      artist_id: string | null;
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
  /** Set only where somebody said, which is a minority of bookings. */
  actual_minutes: number | null;
  outcome_note: string | null;
  /** Needed to say an overrun as an overrun rather than a bare number. */
  ends_at: string;
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
  const { studio, userId } = await requireStudio();
  const supabase = await createClient();
  const artists = await getArtists(studio.id);
  const payable = payableFor(studio, artists.filter((a) => a.active));

  const { data: contactRow } = await supabase
    .from("contacts")
    .select(
      "*, conversations(id, channel, status, created_at, last_message_at, artist_id, "
        + "external_ref, last_inbound_at, " +
        "enquiries(artist_id, description, quote_low_pence, quote_high_pence, bookings(*)))",
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

  /*
   * What this person takes as against the book, and the list it is measured
   * against. Only where the business prices by a named thing — bands describe
   * a piece of work rather than a service somebody is booked for, so there is
   * nothing for a per-client difference to attach to.
   */
  const pricesByList = studio.pricing_model === "services";

  const [{ data: serviceRows }, { data: timingRows }] = pricesByList
    ? await Promise.all([
        supabase
          .from("services")
          .select("*")
          .eq("studio_id", studio.id)
          .eq("active", true)
          .eq("kind", "service")
          .order("sort_order"),
        supabase
          .from("client_service_times")
          .select("service_id, minutes_delta, chargeable, note")
          .eq("contact_id", id),
      ])
    : [{ data: null }, { data: null }];

  const services = (serviceRows ?? []) as Service[];
  const timings = (timingRows ?? []) as ClientTiming[];

  const conversations = contact.conversations ?? [];

  /*
   * Who this client is down to. Same rule as the list, from the same place —
   * see lib/whoseClient.
   */
  const usuallyWith = (() => {
    const id = whoseClient(
      [...conversations.flatMap((c) => c.enquiries?.bookings ?? []), ...(direct ?? [])],
      conversations,
    );
    return id ? (artists.find((a) => a.id === id)?.name.split(" ")[0] ?? null) : null;
  })();

  // Bookings reach a client two ways: through a conversation, or attached
  // directly when somebody typed them into the diary.
  const bookings = [
    ...conversations.flatMap((c) => c.enquiries?.bookings ?? []),
    ...(direct ?? []),
  ]
    .sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at));

  /*
   * Still to come, soonest first — the opposite order from the history,
   * because the next one is the interesting one and the last one is the
   * interesting one on that list.
   *
   * Cancelled left out: an appointment that is not happening is not something
   * they are coming in for, and the history below still carries it.
   */
  const coming = bookings
    .filter((b) => !b.cancelled_at && Date.parse(b.starts_at) >= Date.now())
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))
    .slice(0, 3);

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
        .select("id, booking_id, due_at, sent_at, status, channel, body, error, template_id")
        .in(
          "booking_id",
          bookings.map((b) => b.id),
        )
        .order("due_at", { ascending: false })
    : { data: [] };

  /*
   * Which of those were confirmations rather than reminders.
   *
   * A confirmation is a template set to zero hours before — the right shape
   * for the database and the wrong word on a screen a business reads. Read
   * whole with select("*") because hours_before is what says so and naming
   * columns PostgREST does not know refuses the entire query.
   */
  const { data: allTemplates } = await supabase
    .from("reminder_templates")
    .select("*")
    .eq("studio_id", studio.id);

  const confirmations = new Set(
    (allTemplates ?? [])
      .filter((t) => (t as { hours_before?: number }).hours_before === 0)
      .map((t) => t.id as string),
  );

  /*
   * And what each template is called, so an opened reminder can say which of
   * their settings wrote it. A template that has since been deleted leaves the
   * reminder behind with nothing to name — the column is nullable on purpose,
   * because the record of what was sent outlives the thing that composed it.
   */
  /*
   * Their saved wordings, if they have written any.
   *
   * Read tolerantly and separately: the table arrives in a migration, and a
   * deploy can land before it is run. No table means no picker and the box
   * everybody already had, which is exactly what should happen.
   */
  const { data: quickRows } = await supabase
    .from("message_templates")
    .select("id, label, body")
    .eq("studio_id", studio.id)
    .order("sort_order")
    .order("created_at");

  const quickMessages = (quickRows ?? []) as { id: string; label: string; body: string }[];

  const templateLabels = new Map(
    (allTemplates ?? []).map((t) => [t.id as string, (t as { label?: string }).label ?? null]),
  );

  const timelineReminders = (reminders ?? []).map((r) => ({
    ...r,
    confirmation: Boolean(r.template_id && confirmations.has(r.template_id as string)),
    template_label: r.template_id ? (templateLabels.get(r.template_id as string) ?? null) : null,
  }));

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
    email: contact.email,
    /* Which way they asked to be reached, where they have said. */
    prefers: (contact as { prefers?: string | null }).prefers as "sms" | "email" | null,
    connected: await connectedChannels(supabase, studio.id),
  });
  const mayMessage = await canMessage();

  const live = bookings.filter((b) => !b.cancelled_at);
  const paid = live
    .filter((b) => b.deposit_status === "paid")
    .reduce((t, b) => t + b.deposit_amount_pence, 0);
  const noShows = bookings.filter((b) => b.attended === false).length;

  /*
   * What they have bought over the counter.
   *
   * Guarded on the table existing, because a client record is the wrong page
   * to lose entirely over a migration that has not been run yet — everything
   * else on it still works, so the section simply is not there.
   */
  const purchases: Purchase[] = [];
  if (await hasColumn(supabase, "payments", "gross_pence")) {
    const { data: paymentRows } = await supabase
      .from("payments")
      .select("id, gross_pence, paid_at, description, method, status, stripe_payment_intent_id")
      .eq("contact_id", contact.id)
      /*
       * Paid and refunded, not only paid.
       *
       * A refund is a thing that happened to this client and belongs on their
       * record. Filtering it out would make a payment disappear from their
       * history entirely, which reads as the product having lost it. Pending
       * stays out on purpose: a link nobody has opened yet is not a payment,
       * and showing it would say they had paid when they have not.
       */
      .in("status", ["paid", "refunded"])
      .order("paid_at", { ascending: false })
      .limit(20);

    const ids = (paymentRows ?? []).map((p) => p.id as string);
    const lines = ids.length && (await hasColumn(supabase, "payment_items", "unit_pence"))
      ? ((
          await supabase
            .from("payment_items")
            .select("payment_id, name, quantity, unit_pence")
            .in("payment_id", ids)
            .order("sort_order")
        ).data ?? [])
      : [];

    for (const row of paymentRows ?? []) {
      purchases.push({
        id: row.id as string,
        pence: (row.gross_pence as number) ?? 0,
        when: (row.paid_at as string | null) ?? null,
        description: (row.description as string | null) ?? null,
        method: (row.method as string | null) ?? null,
        status: (row.status as string | null) ?? "paid",
        intent: (row.stripe_payment_intent_id as string | null) ?? null,
        items: (lines as { payment_id: string; name: string; quantity: number; unit_pence: number }[])
          .filter((l) => l.payment_id === row.id)
          .map((l) => ({ name: l.name, quantity: l.quantity, unitPence: l.unit_pence })),
      });
    }
  }

  /*
   * The trade's own facts about this person, in the pack's order, with
   * anything expired marked — see tradeFacts. Empty for almost every trade.
   */
  const today = new Date().toISOString().slice(0, 10);
  const facts = verticalPack(studio.vertical)
    .facts.map((fact: TradeFact) => {
      const value = (contact.trade_facts ?? {})[fact.key];
      const shown = describeFact(fact, value)?.replace(`${fact.label}: `, "") ?? null;
      return {
        fact,
        shown,
        expired: fact.type === "date" && typeof value === "string" && value < today,
      };
    })
    .map(({ fact, shown, expired }) => ({
      key: fact.key,
      label: fact.label,
      type: fact.type,
      hint: expired
        ? `Ran out ${shown}. No more appointments until this is renewed.`
        : fact.blocks && !shown
          ? "Needed before an appointment can be made."
          : null,
      /*
       * A date box wants the ISO form and a yes/no box wants the word, so a
       * stored false comes back as "no" rather than as the string "false",
       * which would match no option and quietly read as not known.
       */
      value:
        fact.type === "yesno"
          ? typeof (contact.trade_facts ?? {})[fact.key] === "boolean"
            ? (contact.trade_facts ?? {})[fact.key]
              ? "yes"
              : "no"
            : ""
          : String((contact.trade_facts ?? {})[fact.key] ?? ""),
    }));

  return (
    <div className="work">
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
          You already had this {wordsFor(studio).customer}, so nothing was added. Their existing details
          are below.
        </p>
      )}

      <h1 className="page-title mt-3">
        {contact.name ?? contact.phone ?? `Unnamed ${wordsFor(studio).customer}`}
      </h1>
      <p className="hint mt-1">
        First in touch{" "}
        {new Date(contact.created_at).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })}{" "}
        · {CHANNEL_LABELS[contact.channel]}
        {/*
          * Whose client this is, on the page you open to pick one up.
          *
          * The list says it; this is where somebody actually needs it —
          * covering for a colleague who is off, and wanting to know whose
          * customer they are about to speak to before they do. Read from their
          * most recent appointment, because that is somebody who has actually
          * worked with them.
          *
          * A label, not a permission. Everybody can open everybody's.
          */}
        {usuallyWith && (
          <>
            {" · "}
            usually with <span className="text-foreground">{usuallyWith}</span>
          </>
        )}
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
            facts={facts}
            factsTitle={verticalPack(studio.vertical).factsTitle}
            client={{
              id: contact.id,
              name: contact.name,
              phone: contact.phone,
              email: contact.email,
              notes: contact.notes,
              alert: contact.alert,
              marketing_consent: contact.marketing_consent,
              marketing_consent_at: contact.marketing_consent_at ?? null,
              marketing_consent_source: contact.marketing_consent_source ?? null,
              marketing_email: contact.marketing_email ?? null,
              marketing_sms: contact.marketing_sms ?? null,
            }}
            /*
             * Their own preferences page, where the database has a token for
             * it. Absent until that migration runs, and the panel simply does
             * not appear rather than offering a link that goes nowhere.
             */
            prefsUrl={
              contact.marketing_token
                ? `${await siteOrigin()}/prefs/${contact.marketing_token}`
                : null
            }
          />

          {/*
            * The record, in the wide column where it can be read.
            *
            * History, what they have bought and their conversations all sat
            * in the 18rem rail beside the form — so the one thing somebody
            * opens a client's page to see was a narrow strip below four
            * action cards, while the column beside it ended at Save and left
            * six hundred pixels of nothing. Giles: there is a big empty space
            * under the settings part, can we move things around.
            *
            * The rail keeps what belongs in a rail: things you press. The
            * page keeps what you came to read.
            */}
          <section className="card p-5">
            <h2 className="section-title mb-4 text-sm">History</h2>
            <Timeline
              bookings={bookings.map((b) => ({
                ...b,
                booked_minutes: Math.round(
                  (Date.parse(b.ends_at) - Date.parse(b.starts_at)) / 60000,
                ),
              }))}
              reminders={timelineReminders as TimelineReminder[]}
              artists={artists}
              timezone={studio.timezone}
            />
          </section>

          <Bought
            purchases={purchases}
            timezone={studio.timezone}
            contactId={contact.id}
            canEmail={Boolean(contact.email)}
          />

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
        </div>

        <aside className="space-y-6">
          <MessageClient
            contactId={contact.id}
            name={contact.name ?? "them"}
            routes={routes}
            allowed={mayMessage}
            /* What they asked for, which beats the cheap default. */
            prefers={(contact as { prefers?: string | null }).prefers ?? null}
            /*
             * Wordings they have saved, ready to drop into the box.
             *
             * Giles asked for templates here. Filled in on the way out rather
             * than pasted raw: a picker that puts "{{name}}" into the box makes
             * every use a find-and-replace, and the once somebody forgets, a
             * customer is addressed as a curly brace.
             */
            templates={quickMessages.map((t) => ({
              id: t.id,
              label: t.label,
              body: fillFor(t.body, {
                name: contact.name,
                business: studio.name,
              }),
            }))}
          />

          {/*
            * Money owed, from the screen where somebody notices it.
            *
            * A client's record is where you end up when you are wondering
            * whether they ever paid for the last one, and until now the only
            * thing you could do from here was message them and ask.
            */}
          <section className="card p-5">
            <h2 className="section-title mb-3 text-sm">Take a payment</h2>
            <AskForPayment
              contactId={contact.id}
              description={`${studio.name}`}
              connected={payable.length > 0}
              people={payable.map((a) => ({ id: a.id, name: a.name }))}
              artistId={payable.find((a) => a.user_id === userId)?.id ?? null}
              channels={routes
                .filter((r) => r.open)
                .map((r) => ({ channel: r.channel, label: CHANNEL_LABELS[r.channel] }))}
            />
          </section>

          {/* Consents, questionnaires and paper forms, kept with them. */}
          <FormsPanel
            studioId={studio.id}
            contactId={contact.id}
            firstName={(contact.name ?? "them").split(" ")[0]}
            channels={
              // The demo offers what a business with texting and email would, and sends nothing.
              studio.kind === "demo"
                ? [
                    ...(contact.phone ? [{ channel: "sms", label: "Text" }] : []),
                    ...(contact.email ? [{ channel: "email", label: "Email" }] : []),
                  ]
                : routes
                    .filter((r) => r.open && (r.channel === "sms" || r.channel === "email"))
                    .map((r) => ({ channel: r.channel, label: r.channel === "sms" ? "Text" : "Email" }))
            }
            mayMessage={mayMessage}
            team={artists.filter((a) => a.active).map((a) => ({ id: a.id, name: a.name }))}
            me={artists.find((a) => a.user_id === userId)?.id ?? null}
          />

          {pricesByList && (
            <Timings
              contactId={contact.id}
              firstName={(contact.name ?? "they").split(" ")[0]}
              services={services}
              timings={timings}
            />
          )}

          {/*
            * When they are next in, and a way straight to it.
            *
            * The history below is everything that has happened, newest first,
            * and the one thing somebody looking up a client actually wants —
            * "when are they in?" — was buried at the top of it among things
            * that already have. Worse, having found it there was nothing to
            * do about it: moving it, taking payment or closing it off all
            * meant going to the diary and hunting for the day.
            */}
          {coming.length > 0 && (
            <section className="card p-5">
              <h2 className="section-title mb-3 text-sm">Coming up</h2>
              <ul className="divide-y divide-border">
                {coming.map((b) => (
                  <li key={b.id}>
                    <Link
                      href={`/diary?day=${b.starts_at.slice(0, 10)}&entry=${b.id}`}
                      className="row -mx-2 flex items-baseline gap-3 rounded-lg px-2 py-2.5"
                    >
                      <span className="text-sm font-medium">
                        {new Intl.DateTimeFormat("en-GB", {
                          timeZone: studio.timezone,
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                          hour: "numeric",
                          minute: "2-digit",
                          hour12: true,
                        }).format(new Date(b.starts_at))}
                      </span>
                      <span className="hint min-w-0 flex-1 truncate">
                        {b.title ?? "Appointment"}
                        {artists.find((a) => a.id === b.artist_id)
                          ? ` · ${artists.find((a) => a.id === b.artist_id)!.name.split(" ")[0]}`
                          : ""}
                      </span>
                      <span className="hint shrink-0">Open →</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

        </aside>
      </div>

      {/* Last, and folded away. Rare, permanent, and the one thing on this
          page that cannot be taken back. */}
      <Forget id={contact.id} name={contact.name} />
    </div>
  );
}
