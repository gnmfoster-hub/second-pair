import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isPlatformAdmin, type BusinessSummary, type PlatformKpis } from "@/lib/platform";
import { VERTICAL_LIST } from "@/lib/verticals";
import { savedWords } from "@/lib/savedAt";
import { Console } from "./Console";

export const metadata = { title: "Second Pair — every business" };

/*
 * Never cached, on purpose.
 *
 * This is a console showing what is happening right now — who has asked for
 * something, who is over their seats, what came in. A cached copy of that is
 * not a slightly stale page, it is a wrong answer: somebody presses reply, the
 * request is dealt with, and the panel goes on saying it is waiting.
 *
 * It is one person's screen, so there is nothing to gain by caching it anyway.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * The suite: every business on the platform, and nothing they said.
 *
 * This exists because nobody signs themselves up. Each business is created here
 * by somebody who has spoken to them, which is what the product actually does
 * and is why there is no sign-up form on the login page.
 *
 * What it deliberately cannot do is read a conversation. The privacy notice
 * tells every customer of every business that nobody else on Second Pair can
 * see what they wrote, and a screen here that could would make that sentence
 * false for all of them at once. Counts are enough to bill somebody and enough
 * to help them; if they need help with one conversation, they can say what it
 * says.
 *
 * Hidden rather than forbidden when the variable is unset: a 404 tells a
 * stranger nothing, where a login page would tell them there is something here.
 */
export default async function AdminPage() {
  if (!(await isPlatformAdmin())) notFound();

  const db = createAdminClient();

  /*
   * One clock for the whole page.
   *
   * Read once rather than per business: fifteen calls to Date.now() while
   * rendering can disagree with each other, and "quiet for 14 days" flipping to
   * 15 halfway down the list would be a small, baffling inconsistency.
   *
   * The rule against impure calls in render is aimed at client components,
   * where a re-render would silently change the answer. This is a server
   * component: it runs once per request, produces one number, and that number
   * is exactly what "how long since they were last busy" means. Reading the
   * clock is the intent, not an accident.
   */
  // eslint-disable-next-line react-hooks/purity
  const asOf = Date.now();

  const [{ data: studios }, { data: members }, { data: users }] = await Promise.all([
    db
      .from("studios")
      .select(
        "id, name, slug, vertical, kind, archived_at, attention_snoozed_until, created_at, hours, plan, plan_pence, seat_limit, account_status, billing_started_on, account_note, channels_allowed, owner_name, owner_phone, trial_ends_on, timezone, tone, greeting, email, deposit_mode, deposit_rule, cancellation_policy, answering_mode, first_refusal_minutes, always_mention, never_mention, escalate_when, service_areas, travel_mode, travel_buffer_minutes, notice_hours, consultation_minutes, max_session_minutes, vat_registered, vat_rate_percent, prices_include_vat, vat_number, privacy_notice_url, terms_url, stripe_account_id, diary_colour",
      )
      .order("created_at"),
    db.from("studio_members").select("studio_id, user_id, role").eq("role", "owner"),
    db.auth.admin.listUsers(),
  ]);

  /*
   * Every open request, in one query rather than one per business.
   *
   * Closed ones are left behind: this screen is about what wants doing, and a
   * business's own help page keeps the history where they can read it.
   */
  /*
   * Every request, including the ones already dealt with.
   *
   * Closed ones were dropped here, which meant that the moment something was
   * answered it vanished from this end — no record of what was asked, what was
   * said, or when. The business could still read it on their own help page and
   * the person who answered it could not, which is the wrong way round.
   *
   * The attention panel still only counts the open ones; these are kept for
   * reading back.
   */
  /*
   * People who asked to be told when something of ours is ready.
   *
   * The marketing site has a form for this and it writes to a table with no
   * screen behind it — no list, no count, and told_at, which exists so a
   * launch email cannot arrive twice, unsettable because nothing could read
   * the rows to set it. An email goes to us on each signup, which is the whole
   * of what anybody knew about it: miss the email, or have it land in spam,
   * and somebody who asked to hear from us is gone.
   *
   * Read here rather than in its own page: it is a handful of rows about our
   * own products and a page of its own would be a page nobody opens.
   */
  const { data: interest } = await db
    .from("product_interest")
    .select("id, product, email, name, note, source, created_at, told_at")
    .order("created_at", { ascending: false })
    .limit(200);

  /*
   * What has reached an inbound address lately, and what was decided.
   *
   * The question this answers is the one asked every time a business is set
   * up: the provider says it has sent a confirmation code to an address of
   * ours, and nothing appears. Three possible reasons, previously
   * indistinguishable — it never arrived, it arrived and was thrown away as a
   * machine talking, or the address named a business that does not exist.
   *
   * Read whole and shown newest first. A short list on purpose: this is for
   * "did that just arrive", not for reading a week's mail.
   */
  const { data: inbound } = await db
    .from("inbound_emails")
    .select("*")
    .order("at", { ascending: false })
    .limit(25);

  const { data: tickets } = await db
    .from("support_tickets")
    .select("id, studio_id, subject, status, updated_at, from_conversation_id")
    .order("updated_at", { ascending: false });

  const { data: ticketMessages } = tickets?.length
    ? await db
        .from("support_messages")
        .select("id, ticket_id, author, body, created_at")
        .in("ticket_id", tickets.map((t) => t.id))
        .order("created_at")
    : { data: [] };

  /*
   * What they were actually saying when the request was raised.
   *
   * The help assistant files a request out of a conversation and writes the
   * conversation's id onto the ticket. The migration that added the column
   * indexed it. Nothing has ever read it — so a ticket arrives here titled
   * with the assistant's one-line summary of a problem, and the ten minutes of
   * back-and-forth that produced it, including everything the assistant
   * already tried, sits one column away and unreachable. Whoever picks it up
   * answers blind, and usually by asking the question the person has already
   * answered.
   *
   * Only for tickets still needing something. A closed one is history, and
   * reading every conversation behind every request ever raised would be a
   * large query to render something nobody is looking at.
   */
  const liveOrigins = (tickets ?? [])
    .filter((t) => t.status !== "closed" && t.from_conversation_id)
    .map((t) => t.from_conversation_id as string);

  /*
   * And only ever the help assistant's own conversations.
   *
   * This screen says at the bottom that it cannot open a conversation, and it
   * means it: every customer of every business here has been told that nobody
   * else on Second Pair can read what they wrote. A request is only ever filed
   * out of a support conversation — a business owner talking to us, in our own
   * studio, which is not anybody's customer — so reading those breaks nothing.
   *
   * Checked rather than assumed, because the difference between the two is one
   * uuid in one column, and the cost of being wrong about it once is the only
   * promise this product makes that cannot be made again.
   */
  const supportSlug = process.env.NEXT_PUBLIC_SUPPORT_SLUG?.trim() || null;

  const { data: supportStudio } = supportSlug
    ? await db.from("studios").select("id").eq("slug", supportSlug).maybeSingle()
    : { data: null };

  const { data: ours } = liveOrigins.length && supportStudio
    ? await db
        .from("conversations")
        .select("id")
        .in("id", liveOrigins)
        .eq("studio_id", supportStudio.id)
    : { data: [] };

  const readable = (ours ?? []).map((c) => c.id as string);

  const { data: originMessages } = readable.length
    ? await db
        .from("messages")
        .select("id, conversation_id, role, content, created_at")
        .in("conversation_id", readable)
        .order("created_at")
    : { data: [] };

  /*
   * What is plugged in, for every business at once.
   *
   * One query rather than one per business: this is a small table, and a
   * support call is not the moment to be waiting on thirteen round trips.
   *
   * The person's name comes along because "belongs to somebody" is the
   * question that actually gets asked — a number pointed at one artist behaves
   * completely differently from the same number pointed at the shop, and there
   * is no way to tell from the number.
   */
  const { data: connections } = await db
    .from("channel_connections")
    .select("id, studio_id, channel, label, external_id, active, forward_to, updated_at, artists(name)")
    .order("channel");

  const emailFor = new Map((users?.users ?? []).map((u) => [u.id, u.email ?? null]));

  /*
   * Counted per business rather than fetched.
   *
   * `head: true` asks Postgres for the number and no rows, so nothing anybody
   * wrote crosses the wire — which is the whole point of this screen and worth
   * the extra queries.
   */
  const summaries: BusinessSummary[] = await Promise.all(
    (studios ?? []).map(async (s) => {
      /*
       * Counted, and told when it cannot be.
       *
       * This swallowed errors into a zero, and bookings has no studio_id — it
       * hangs off artist_id — so every business showed nought booked however
       * busy it was. A metric that silently reads zero is worse than no metric:
       * it is a number somebody will believe.
       */
      const count = async (table: string) => {
        const { count: n, error } = await db
          .from(table)
          .select("id", { count: "exact", head: true })
          .eq("studio_id", s.id);
        if (error) throw new Error(`${table}: ${error.message}`);
        return n ?? 0;
      };

      /** Bookings belong to a person, and the person belongs to the business. */
      const bookings = async () => {
        const { count: n, error } = await db
          .from("bookings")
          .select("id, artists!inner(studio_id)", { count: "exact", head: true })
          .eq("artists.studio_id", s.id)
          .is("cancelled_at", null);
        if (error) throw new Error(`bookings: ${error.message}`);
        return n ?? 0;
      };

      const { data: latest } = await db
        .from("conversations")
        .select("last_message_at")
        .eq("studio_id", s.id)
        .order("last_message_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const hours = (s.hours ?? []) as { day: number; open: string; close: string; closed: boolean }[];

      /*
       * The other ways to look at a demo.
       *
       * Four logins were made for the demo salon and three of them could be
       * reached by nothing: a stylist renting her chair, an employee whose
       * settings the business keeps, and somebody on the desk with no column
       * in the diary. Those are the three views a salon actually asks about,
       * and the owner's — the only one that could be opened — is the least
       * interesting of the four, because it is the one where everything is
       * visible and nothing has been decided for you.
       *
       * Demos only. On a real business this would be a list of people whose
       * account somebody could walk into, which is not a feature.
       */
      const views: BusinessSummary["views"] = [];

      if ((s.kind ?? "customer") === "demo") {
        const [{ data: everyone }, { data: linked }] = await Promise.all([
          db.from("studio_members").select("user_id, role").eq("studio_id", s.id),
          db.from("artists").select("user_id, name, role, owner_managed").eq("studio_id", s.id),
        ]);

        const asArtist = new Map(
          (linked ?? [])
            .filter((a) => a.user_id)
            .map((a) => [a.user_id as string, a]),
        );

        for (const m of everyone ?? []) {
          const person = asArtist.get(m.user_id);
          views.push({
            userId: m.user_id,
            /*
             * Named by who they are in the salon rather than by their login.
             * "Aisha" is the thing being demonstrated; the address is an
             * implementation detail of how the demo was built.
             */
            label: person ? (person.name as string) : m.role === "owner" ? "The owner" : "On the desk",
            what:
              m.role === "owner"
                ? "everything"
                : person
                  ? person.owner_managed
                    ? "employed — the business keeps her settings"
                    : "renting a chair — her own prices, list and reminders"
                  : "no column in the diary: the inbox and everybody's day",
          });
        }

        // The owner first, then whoever is least like them.
        views.sort((a, b) => (a.label === "The owner" ? -1 : b.label === "The owner" ? 1 : 0));
      }

      return {
        id: s.id,
        name: s.name,
        slug: s.slug,
        vertical: s.vertical,
        kind: (s.kind ?? "customer") as BusinessSummary["kind"],
        archivedAt: s.archived_at ?? null,
        snoozedUntil: s.attention_snoozed_until ?? null,
        createdAt: s.created_at,
        owners: (members ?? [])
          .filter((m) => m.studio_id === s.id)
          .map((m) => ({ userId: m.user_id, email: emailFor.get(m.user_id) ?? null })),
        views,
        people: await count("artists"),
        team: (
          await db
            .from("artists")
            .select("*")
            .eq("studio_id", s.id)
            .order("created_at")
        ).data?.map((a) => ({
          id: a.id as string,
          name: a.name as string,
          role: (a.role as string | null) ?? null,
          email: (a.email as string | null) ?? null,
          active: a.active as boolean,
          hourlyRatePence: (a.hourly_rate_pence as number) ?? 0,
          minChargePence: (a.min_charge_pence as number) ?? 0,
          ownerManaged: (a.owner_managed as boolean) ?? false,
          notifyOwnBookings: (a.notify_own_bookings as boolean) ?? true,
          remindersOwn: (a.reminders_own as boolean) ?? false,
          travelBufferMinutes: (a.travel_buffer_minutes as number | null) ?? null,
          personalIcalUrl: (a.personal_ical_url as string | null) ?? null,
          personalCalendarError: (a.personal_calendar_error as string | null) ?? null,
          hasLogin: Boolean(a.user_id),
        })) ?? [],
        services: await count("price_bands"),
        hasHours: hours.some((h) => !h.closed),
        conversations: await count("conversations"),
        bookings: await bookings(),
        lastActivityAt: latest?.last_message_at ?? null,
        plan: s.plan ?? null,
        planPence: s.plan_pence ?? 0,
        seatLimit: s.seat_limit ?? null,
        status: (s.account_status ?? "trial") as BusinessSummary["status"],
        billingStartedOn: s.billing_started_on ?? null,
        note: s.account_note ?? null,
        channels: (s.channels_allowed ?? ["web"]) as string[],
        ownerName: s.owner_name ?? null,
        ownerPhone: s.owner_phone ?? null,
        trialEndsOn: s.trial_ends_on ?? null,
        connections: (
          (connections ?? []) as unknown as {
            id: string;
            studio_id: string;
            channel: string;
            label: string | null;
            external_id: string | null;
            active: boolean;
            forward_to: string | null;
            updated_at: string | null;
            artists: { name: string } | null;
          }[]
        )
          .filter((c) => c.studio_id === s.id)
          .map((c) => ({
            id: c.id,
            channel: c.channel,
            label: c.label,
            externalId: c.external_id,
            forWho: c.artists?.name ?? null,
            active: c.active,
            forwardTo: c.forward_to,
            savedAt: savedWords(c.updated_at),
          })),
        tickets: (tickets ?? [])
          .filter((t) => t.studio_id === s.id)
          .map((t) => ({
            id: t.id,
            subject: t.subject,
            status: t.status as "open" | "answered" | "closed",
            /*
             * The tail of it, not the whole thing.
             *
             * The last dozen turns are what the request came out of; the first
             * dozen are usually somebody being told where a button is. A
             * support screen that opens with forty messages on it is one
             * nobody reads.
             */
            origin: t.from_conversation_id
              ? (originMessages ?? [])
                  .filter((m) => m.conversation_id === t.from_conversation_id)
                  .slice(-12)
                  .map((m) => ({
                    id: m.id as string,
                    role: String(m.role),
                    body: String(m.content ?? ""),
                    at: m.created_at as string,
                  }))
              : [],
            messages: (ticketMessages ?? [])
              .filter((m) => m.ticket_id === t.id)
              .map((m) => ({
                id: m.id,
                author: m.author as "owner" | "support",
                body: m.body,
                at: m.created_at,
              })),
          })),
        settings: {
          timezone: s.timezone ?? "Europe/London",
          tone: s.tone ?? null,
          greeting: s.greeting ?? null,
          email: s.email ?? null,
          depositMode: s.deposit_mode ?? "none",
          depositRule: (s.deposit_rule ?? { type: "fixed", amount_pence: 0 }) as {
            type: string;
            amount_pence?: number;
            percent?: number;
            min_pence?: number;
          },
          cancellationPolicy: s.cancellation_policy ?? "",
          answeringMode: s.answering_mode ?? "when_free",
          firstRefusalMinutes: s.first_refusal_minutes ?? 5,
          alwaysMention: (s.always_mention ?? []) as string[],
          neverMention: (s.never_mention ?? []) as string[],
          escalateWhen: (s.escalate_when ?? []) as string[],
          serviceAreas: (s.service_areas ?? []) as string[],
          travelMode: s.travel_mode ?? "at_premises",
          travelBufferMinutes: s.travel_buffer_minutes ?? 0,
          noticeHours: s.notice_hours ?? 24,
          consultationMinutes: s.consultation_minutes ?? 30,
          maxSessionMinutes: s.max_session_minutes ?? 480,
          vatRegistered: Boolean(s.vat_registered),
          vatRatePercent: s.vat_rate_percent ?? 20,
          pricesIncludeVat: Boolean(s.prices_include_vat),
          vatNumber: s.vat_number ?? null,
          privacyNoticeUrl: s.privacy_notice_url ?? null,
          termsUrl: s.terms_url ?? null,
          stripeAccountId: s.stripe_account_id ?? null,
          diaryColour: s.diary_colour ?? "category",
          hours: hours as { day: number; open: string; close: string; closed: boolean }[],
        },
        quietDays: latest?.last_message_at
          ? Math.floor((asOf - new Date(latest.last_message_at).getTime()) / 86_400_000)
          : null,
      };
    }),
  );

  /*
   * The platform's own numbers.
   *
   * Aggregated across every business, which is the one place that is legitimate
   * — nobody's individual conversation is read to produce them, and the totals
   * are what make the case to the next customer.
   *
   * `won` is the quoted value of what the assistant booked. It is the number
   * worth quoting, and it is deliberately the estimate rather than what was
   * finally charged, because the second is not something this ever sees.
   */
  /*
   * What it cost lives on the message that cost it, as JSON.
   *
   * This asked an ai_spend table for it, which does not exist — and the error
   * became a zero, so the panel reported that running the assistant across
   * fifty-three enquiries had cost nothing. The third time in one screen that a
   * swallowed query became a plausible number, which is the argument for not
   * swallowing them.
   */
  const [{ data: won }, { data: spend, error: spendError }] = await Promise.all([
    db.from("enquiries").select("quote_low_pence, conversations!inner(status, studio_id)"),
    db.from("messages").select("usage").eq("role", "assistant").not("usage", "is", null),
  ]);
  if (spendError) throw new Error(`cost: ${spendError.message}`);

  /*
   * Counted for customers, like everything else on this screen.
   *
   * This was the whole of it — every demonstration, every test business, and
   * every walk-through somebody did to check a fix. "It has booked £14,000 of
   * work for eleven businesses" is the sentence this figure exists to support,
   * and a figure padded with a salon that does not exist cannot support it.
   * The counting was corrected for the business totals when the three kinds
   * were introduced and never carried through to the work.
   */
  const forCustomers = new Set(
    summaries.filter((b) => b.kind === "customer" && !b.archivedAt).map((b) => b.id),
  );

  const wonPence = (won ?? [])
    .filter((e) => {
      const conversation = e.conversations as unknown as {
        status: string;
        studio_id: string;
      } | null;
      return conversation?.status === "booked" && forCustomers.has(conversation.studio_id);
    })
    .reduce((sum, e) => sum + (e.quote_low_pence ?? 0), 0);

  /*
   * The figures count customers, and only customers.
   *
   * They counted everything: two real businesses, several demonstrations, some
   * test junk and Second Pair's own support studio, presented as one total. A
   * number somebody is going to quote at a prospect has to be true, and "we
   * have fifteen businesses" was not.
   *
   * The money is the exception — work won and cost to run are real whoever
   * they happened to, and excluding a demo's enquiries would understate what
   * the assistant has actually done.
   */
  /*
   * Stopped businesses leave the figures entirely.
   *
   * They are not customers any more — counting them would overstate what the
   * platform is earning and, worse, keep them in the attention list asking to
   * be set up.
   */
  const counted = summaries.filter((b) => forCustomers.has(b.id));

  const kpis: PlatformKpis = {
    businesses: counted.length,
    live: counted.filter((b) => b.conversations > 0).length,
    unfinished: counted.filter((b) => !(b.people > 0 && b.services > 0 && b.hasHours)).length,
    mrr: counted
      .filter((b) => b.status === "active" || b.status === "overdue")
      .reduce((sum, b) => sum + b.planPence, 0),
    paying: counted.filter((b) => b.status === "active").length,
    enquiries: counted.reduce((sum, b) => sum + b.conversations, 0),
    booked: counted.reduce((sum, b) => sum + b.bookings, 0),
    wonPence,
    // Micros are millionths of a dollar-equivalent; a hundredth of that is a
    // penny, which is the unit everything else on this screen is in.
    costPence: Math.round(
      (spend ?? []).reduce(
        (sum, m) => sum + ((m.usage as { cost_micros?: number } | null)?.cost_micros ?? 0),
        0,
      ) / 10_000,
    ),
    seatsUsed: counted.reduce((sum, b) => sum + b.people, 0),
    seatsSold: counted.reduce((sum, b) => sum + (b.seatLimit ?? b.people), 0),
  };

  /*
   * Does whoever is looking also run a business? Decides whether the way back
   * to a diary is worth showing, because for the platform login there is none.
   */
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const hasOwnBusiness = (members ?? []).some((m) => m.user_id === user?.id);

  return (
    <Console
      hasOwnBusiness={hasOwnBusiness}
      kpis={kpis}
      businesses={summaries}
      inbound={(inbound ?? []).map((r) => ({
        id: r.id as string,
        to: (r.to_address as string | null) ?? null,
        from: (r.from_address as string | null) ?? null,
        subject: (r.subject as string | null) ?? null,
        verdict: String(r.verdict),
        because: (r.because as string | null) ?? null,
        at: r.at as string,
      }))}
      interest={(interest ?? []).map((r) => ({
        id: r.id as string,
        product: r.product as string,
        email: r.email as string,
        name: (r.name as string | null) ?? null,
        note: (r.note as string | null) ?? null,
        source: (r.source as string | null) ?? null,
        at: r.created_at as string,
        toldAt: (r.told_at as string | null) ?? null,
      }))}
      trades={VERTICAL_LIST.map((v) => ({ value: v.id, label: v.label }))}
    />
  );
}
