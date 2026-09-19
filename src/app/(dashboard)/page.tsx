import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireStudio } from "@/lib/studio";
import { isOutOfHours } from "@/lib/report";
import { readinessOf } from "@/lib/readiness";
import { Readiness } from "@/components/Readiness";
import { DemoReset } from "@/components/DemoReset";
import { Page, PageHeader } from "@/components/PageHeader";
import { colourForName, initialsOf } from "@/lib/diaryColour";
import { ChannelIcon } from "@/components/ChannelIcon";
import { Ticker } from "@/components/Ticker";
import { Band, Figure } from "@/components/Figures";
import { Waiting } from "@/components/Waiting";
import {
  CHANNEL_LABELS,
  CONV_STATUS_LABELS,
  type Channel,
  type ConvStatus,
} from "@/lib/types";
import { inboxScope, scopedTo } from "@/lib/inboxScope";

/*
 * What state a conversation is in, readable without reading it.
 *
 * Four of these seven were the same grey — including Qualified, which is the
 * assistant having done the job the business pays for. A whole inbox of grey
 * pills is a column of words you have to read one at a time, and it is the
 * single biggest thing a list like this can do for somebody glancing at their
 * phone between jobs.
 *
 * Three meanings and no more, or it becomes bunting:
 *   green   money is coming, or has
 *   orange  you have to do something — the only place orange appears
 *   grey    nothing to do here
 *
 * New keeps the accent rather than a fourth colour: it is not yet good news
 * and it is not yet a job, it is just recent.
 */
const STATUS_STYLES: Record<ConvStatus, string> = {
  new: "bg-accent/8 text-accent",
  qualified: "bg-ok/12 text-ok",
  deposit_paid: "bg-ok/15 text-ok",
  booked: "bg-ok/15 text-ok",
  needs_human: "bg-highlight/15 text-highlight-strong",
  lost: "bg-surface-2 text-muted/70",
  spam: "bg-surface-2 text-muted/70",
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

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ whose?: string }>;
}) {
  const { whose } = await searchParams;
  const { studio, userId } = await requireStudio();
  const supabase = await createClient();

  const sevenDaysAgo = weekAgo();

  /*
   * The inbox is one person's, not the whole shop's.
   *
   * Everybody saw every enquiry in the business, which is wrong in both
   * directions: a stylist waded through conversations that were never hers,
   * and the one waiting on her was somewhere in the middle of them. This is
   * the screen somebody opens between clients, and it has to be about them.
   *
   * The diary stays shared — anybody may need to move anybody's day around,
   * and that is a different question from whose enquiry this is.
   */
  // Who this person is here, and what they are allowed to see. Two questions
  // about the same person that do not depend on each other, so they go
  // together rather than one waiting on the other.
  const [{ data: me }, { data: membership }] = await Promise.all([
    supabase
      .from("artists")
      .select("id")
      .eq("studio_id", studio.id)
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("studio_members")
      .select("role")
      .eq("studio_id", studio.id)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  const owns = membership?.role === "owner";

  // Only the owner is offered the choice, so only they need the list.
  const { data: team } = owns
    ? await supabase
        .from("artists")
        .select("id, name")
        .eq("studio_id", studio.id)
        .eq("active", true)
        .order("name")
    : { data: [] as { id: string; name: string }[] };

  let inbox = supabase
    .from("conversations")
    .select(
      "id, channel, status, created_at, last_message_at, artist_id, " +
        "contacts(name, instagram_handle, phone, email, alert), " +
        "enquiries(description, quote_low_pence, bookings(cancelled_at))",
    )
    .eq("studio_id", studio.id)
    // Rehearsals by the owner never appear here, or every figure below is a
    // lie about how much work the assistant actually did.
    .eq("is_test", false)
    .order("last_message_at", { ascending: false })
    .limit(50);

  /*
   * Theirs, and anything nobody has claimed.
   *
   * An enquiry from the website may arrive before anybody has been chosen, and
   * those belong to whoever runs the place until they are. Sending them
   * nowhere would lose them entirely, which is the one outcome worth avoiding
   * on this screen.
   *
   * Somebody with a login but no diary of their own — a manager, an
   * administrator — sees the unclaimed ones too. They are here to answer
   * people, and hiding everything from them would leave them an empty screen.
   */
  /*
   * Whose enquiries this person sees.
   *
   * The rule is in lib/inboxScope and tested there, because the badge in the
   * sidebar asks the same question — and a badge saying three above a list
   * showing one sends somebody looking for work that was never theirs.
   */
  const scope = inboxScope({ owns, artistId: me?.id ?? null, whose });
  inbox = scopedTo(inbox, scope);

  /*
   * The figures and the waiting list ask their own questions.
   *
   * Both were counted off the fifty rows above, and those fifty are a list
   * built for looking at — most recently active first, because that is the
   * order somebody wants to read them in. Nothing about that order suits
   * counting.
   *
   * A salon taking ten enquiries a day fills fifty inside a week, so "what the
   * assistant won you" would start undercounting at exactly the point it
   * became worth reading, and quietly: the number stays plausible, it is just
   * too small. That figure is the argument for paying for this at all.
   *
   * The waiting list was worse. Somebody marked as needing a person dropped
   * off the bottom as soon as fifty livelier conversations sat above them —
   * still waiting, still flagged, invisible on the one screen that exists to
   * say so. There are never many of these, so they are asked for by name.
   */
  type WeekRow = {
    created_at: string;
    status: ConvStatus;
    enquiries: {
      quote_low_pence: number | null;
      bookings: { cancelled_at: string | null }[];
    } | null;
  };

  /* The week's figures. Spam is taken out below, in code, not in the query. */
  let counted = supabase
    .from("conversations")
    .select("created_at, status, enquiries(quote_low_pence, bookings(cancelled_at))")
    .eq("studio_id", studio.id)
    .eq("is_test", false)
    .gte("created_at", sevenDaysAgo);
  counted = scopedTo(counted, scope);

  let flagged = supabase
    .from("conversations")
    .select("id")
    .eq("studio_id", studio.id)
    .eq("is_test", false)
    .eq("status", "needs_human");
  flagged = scopedTo(flagged, scope);

  /*
   * All three at once, not one after another.
   *
   * They were awaited in turn when the counting was split out, which quietly
   * added two round trips to the slowest screen in the product — the one
   * somebody opens between clients, on a phone, on a salon's wifi. Three
   * questions that do not depend on each other should cost what one costs.
   *
   * Cast to plain promises first. Handed the query builders directly,
   * Promise.all tries to infer a tuple of three deeply-generic Supabase types
   * and the compiler gives up (TS2589), which is what sent this down the
   * sequential path in the first place.
   */
  type Rows<T> = Promise<{ data: T[] | null }>;

  const [{ data }, { data: weekRows }, { data: needsSomebody }] = await Promise.all([
    inbox as unknown as Rows<Row>,
    counted as unknown as Rows<WeekRow>,
    flagged as unknown as Rows<{ id: string }>,
  ]);

  /*
   * Spam is dropped here, in code, and deliberately not in the query.
   *
   * Asking PostgREST for "status is not spam" names a value the database has
   * never heard of until its migration is run — and it does not ignore an
   * unknown enum value, it refuses the whole statement. So the inbox came back
   * empty on every business while the badge, which is a different query, went
   * on counting. An empty inbox with a number on the icon, everywhere, from
   * one line meant to hide list sellers.
   *
   * The same mistake as the trade fields and the by-channel meter, and the
   * lesson is the same one: a new value is optional until its migration has
   * definitely run, and the safe place to use it is in code, where an unknown
   * word is simply a word nothing matches.
   */
  const conversations = (data ?? []).filter((c) => c.status !== "spam");
  const week = (weekRows ?? []).filter((c) => c.status !== "spam");

  // Framed as what the assistant did, not as what happened — that is the thing
  // being paid for, and the reason to open this page at all.
  const recent = week;
  const whileShut = recent.filter((c) =>
    isOutOfHours(new Date(c.created_at), studio.hours, studio.timezone),
  );
  const isBooked = (c: WeekRow) =>
    (c.enquiries?.bookings ?? []).some((b) => !b.cancelled_at);

  const booked = recent.filter(isBooked);
  const recovered = whileShut
    .filter(isBooked)
    .reduce((total, c) => total + (c.enquiries?.quote_low_pence ?? 0), 0);

  const waiting = needsSomebody ?? [];

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
      {/*
        * Whose enquiries, for the owner only.
        *
        * Their own by default: a shop with four stylists would otherwise bury
        * the owner's own work under everybody else's. The rest are a click
        * away for when something needs sorting out.
        */}
      {/*
        * Shown to whoever can act on more than their own.
        *
        * The owner, and anybody on the desk with no diary of their own — a
        * receptionist is there to deal with everybody's, and a filter is how
        * "what has Sarah got coming in" gets answered without leaving the
        * screen. A stylist sees her own and has nothing to filter.
        */}
      {(owns || !me) && (team ?? []).length > 1 && (
        <div className="mt-5 flex flex-wrap items-center gap-1.5">
          <WhoseLink href="/" current={whose} match={undefined}>
            Mine
          </WhoseLink>
          <WhoseLink href="/?whose=everyone" current={whose} match="everyone">
            Everyone
          </WhoseLink>
          {(team ?? [])
            .filter((a) => a.id !== me?.id)
            .map((a) => (
              <WhoseLink key={a.id} href={`/?whose=${a.id}`} current={whose} match={a.id}>
                {a.name}
              </WhoseLink>
            ))}
        </div>
      )}

      {/*
       * One card, ruled inside — the same figures the back office uses.
       *
       * Three separate cards made each number its own object with equal
       * weight, which is wrong for a row meant to be read left to right as one
       * sentence: it answered this many, it won you this much, this many want
       * you. Hairlines say those belong together; three boxes say they are
       * three unrelated facts that happen to be adjacent.
       *
       * The money keeps the brand colour because it is the only figure here
       * that answers "is this worth paying for", and a screen where everything
       * is the same navy has no answer to that at all. The darker orange, not
       * the bright one — the bright one is a fill to put ink on and does not
       * pass contrast as text on paper.
       */}
      {recent.length > 0 && (
        <div className="card settle mt-5 overflow-hidden p-0">
          <Band inline>
            <Figure inline label="Booked in">
              <Ticker value={booked.length} />
            </Figure>
            <Figure
              inline
              label="Won while you were busy"
              /*
               * The one number on the row that is the reason to pay for this.
               * Everything else on the line is context for it.
               */
              lead
              note={whileShut.length > 0 ? `${whileShut.length} came in out of hours` : undefined}
            >
              <Ticker value={recovered} money />
            </Figure>
            {/*
              * The one figure on this row that is asking for something.
              *
              * It had the warn brown, which recedes, while the two figures
              * either side of it — money already won — had the orange. The
              * screen was pointing at the good news and mumbling the job.
              */}
            <Figure inline label="Need you" act={waiting.length > 0}>
              <Ticker value={waiting.length} />
            </Figure>
          </Band>
        </div>
      )}

      <Readiness capabilities={capabilities} />

      {/*
        * Only on the demo, where a demonstration leaves marks.
        *
        * Somebody books a client in to show how it works, cancels one to show
        * what happens, types a reply in the inbox — and the next person shown
        * it opens a salon with a half-finished conversation in it. The button
        * belongs where the mess is, rather than in a back office nobody is
        * looking at afterwards.
        */}
      {studio.kind === "demo" && <DemoReset />}

      {/*
        * A ledger on the page, not a third white box.
        *
        * There were three stacked rounded rectangles with identical treatment
        * — the figures, the readiness card and this — and when everything is a
        * card nothing is. This is the longest thing on the screen and the
        * thing somebody came for, so it stops being a container and becomes
        * the page itself: a rule, a heading, and the work under it.
        *
        * It also gives the two cards above it a job. They are cards because
        * they are asides; this is not an aside.
        */}
      <div className="mt-7">
        <div className="mb-0 flex items-baseline justify-between border-b-2 border-foreground/85 pb-1.5">
          <h2 className="font-display text-sm font-semibold tracking-[-0.01em]">
            {conversations.length} {conversations.length === 1 ? "enquiry" : "enquiries"}
          </h2>
          {waiting.length > 0 && (
            <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-highlight-strong">
              {waiting.length} need you
            </span>
          )}
        </div>
        {conversations.length === 0 ? (
          <div className="empty">
            <Waiting className="mx-auto mb-4 size-14" />
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
          /*
           * White paper under the rows, and a proper line between them.
           *
           * Taking the card away stopped it being a third identical box and
           * also took away the only thing separating fifteen rows from each
           * other and from the page — Giles: "the boxes seem to all blend into
           * one". Right on both counts, and they are different problems.
           *
           * Then the page itself became paper, and the sheet stopped being
           * needed at all: there is nothing for a white panel to stand out
           * against any more. What is left is what a printed page would do —
           * a rule under the heading, a rule between each row, and the work.
           * No panel, and nothing blending into anything, because the rules
           * are doing the separating rather than a change of colour.
           */
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
              /*
               * How much of the screen this row has earned.
               *
               * Every row was identical: same height, same circle, same badge
               * in the same place, same timestamp in the same place. Fifteen
               * enquiries read as one shape repeated fifteen times, which is
               * what made the whole thing look assembled rather than designed.
               * A booked job, a lost one and somebody waiting on an answer are
               * three different things and looked like one.
               *
               * Three weights, from the status we already have:
               *
               *   asks   somebody is waiting on a person. Full contrast, and
               *          the only place the orange appears in the list.
               *   won    money is coming or has. Normal weight, green.
               *   gone   lost or spam. Recedes — still readable, still
               *          clickable, but it stops competing with live work.
               *
               * Nothing new is drawn and no colour is invented. The rows that
               * matter simply stop being shouted down by the ones that do not.
               */
              const tone =
                c.status === "needs_human"
                  ? "asks"
                  : c.status === "lost" || c.status === "spam"
                    ? "gone"
                    : c.status === "booked" || c.status === "deposit_paid"
                      ? "won"
                      : "live";

              const outOfHours = isOutOfHours(
                new Date(c.created_at),
                studio.hours,
                studio.timezone,
              );

              return (
                <li key={c.id}>
                  <Link
                    href={`/conversations/${c.id}`}
                    /*
                     * Recede, not disappear.
                     *
                     * This was the whole row at fifty-five per cent, and on an
                     * inbox where over half the enquiries are marked lost that
                     * is most of the screen looking switched off — Giles said
                     * it read as greyed out, and it did.
                     *
                     * A lost enquiry is still a real thing that happened and
                     * somebody may well want to read it. So the row keeps its
                     * full strength and only the badge and the avatar step
                     * back, below. What was wanted was less shouting from the
                     * dead ones, not a disabled list.
                     */
                    className="row group flex items-center gap-3.5 px-4 py-3.5 sm:px-5"
                  >
                    {/*
                      * A mark for the one state that is asking for something.
                      *
                      * Not a rail down every row — that is decoration on the
                      * fourteen rows it does not apply to. One dot, on the one
                      * row that wants a person, in the one colour that means
                      * act. Everything else gets nothing, which is what makes
                      * it visible.
                      */}
                    <span
                      className={`-ml-1.5 size-1.5 shrink-0 rounded-full ${
                        tone === "asks" ? "bg-highlight" : "bg-transparent"
                      }`}
                      aria-hidden
                    />
                    {/* A face, so the list scans as people rather than rows —
                        and where there is no person yet, where they came in. */}
                    {named ? (
                      <span
                        className={`grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold text-white ${
                          tone === "gone" ? "opacity-45" : ""
                        }`}
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
                        <span
                          className={`truncate text-sm ${
                            tone === "asks" ? "font-semibold" : "font-medium"
                          }`}
                        >
                          {who}
                        </span>
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
                              c.status === "needs_human" ? "text-warn" : "text-muted"
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

/** One choice in the owner's "whose enquiries" row. */
function WhoseLink({
  href,
  current,
  match,
  children,
}: {
  href: string;
  current: string | undefined;
  match: string | undefined;
  children: React.ReactNode;
}) {
  const on = current === match;
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
        on
          ? "border-accent bg-accent/10 text-accent"
          : "border-border text-muted hover:text-foreground"
      }`}
    >
      {children}
    </Link>
  );
}
