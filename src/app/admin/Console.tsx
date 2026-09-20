"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { signOut } from "@/app/(dashboard)/actions";
import type { BusinessSummary } from "@/lib/platform";
import { supplyOf } from "@/lib/voice/numberCost";
import { Team } from "./Team";
import {
  createBusiness,
  resetLink,
  openDemo,
  rebuildDemo,
  deleteBusiness,
  saveAccount,
  fixSettings,
  fixChannel, assignNumber, setForwarding, switchLine,
  answerTicket,
  setKind,
  snoozeAttention,
  archiveBusiness,
  markTold,
  type Result,
} from "./actions";
import { formatPence } from "@/lib/money";
import { colourForName, initialsOf } from "@/lib/diaryColour";
import { readableNumber } from "@/lib/channels/phoneNumbers";
import { Band, Figure } from "@/components/Figures";
import type { PlatformKpis } from "@/lib/platform";

/**
 * Every business, what state it is in, and the four things worth doing to one.
 *
 * Built around supporting somebody on the phone: the questions this answers are
 * "have they actually finished setting up", "are they using it", and "how do I
 * get them back in". Not "what did their customer say" — see the note on
 * lib/platform.ts for why that is missing on purpose.
 */
export function Console({
  kpis,
  businesses,
  trades,
  hasOwnBusiness,
  interest,
  inbound,
}: {
  kpis: PlatformKpis;
  businesses: BusinessSummary[];
  interest: Waiting[];
  inbound: Arrived[];
  trades: { value: string; label: string }[];
  /** Whether this administrator also runs a business, and so has a diary. */
  hasOwnBusiness: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [find, setFind] = useState("");

  const needle = find.trim().toLowerCase();
  const shown = needle
    ? businesses.filter((b) =>
        [b.name, b.slug, b.ownerName, b.ownerPhone, b.owners[0]?.email]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(needle)),
      )
    : businesses;

  /*
   * The two kinds, apart. A demonstration is not a customer, and the one place
   * it must never look like one is the screen where decisions get made.
   */
  const real = shown.filter((b) => b.kind !== "demo");
  const pretend = shown.filter((b) => b.kind === "demo");

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      {/*
        * No link back when there is nowhere to go back to.
        *
        * The platform login owns no business, so "/" sends it straight here
        * again — a link that appeared to do nothing, because it did nothing.
        * It only shows for somebody who also runs a business of their own,
        * which is the only case where it means anything.
        */}
      {hasOwnBusiness && (
        <Link href="/" className="hint inline-flex items-center gap-1.5 hover:text-foreground">
          &larr; Your own diary
        </Link>
      )}

      <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-2">
        <h1 className="page-title">Second Pair</h1>
        <span className="hint">the business behind the businesses</span>
        <div className="ml-auto flex items-center gap-2">
          <Link href="/admin/reports" className="btn-ghost">
            Reports
          </Link>
          <Link href="/admin/billing" className="btn-ghost">
            Billing
          </Link>
          <button
            type="button"
            onClick={() => setAdding((a) => !a)}
            className="btn bg-highlight text-on-highlight"
          >
            {adding ? "Not now" : "Set one up"}
          </button>
          {/*
            * A way out, because this account exists to be swapped away from.
            *
            * Running the platform and being a customer are two different
            * logins on purpose, so the thing somebody does most often after
            * finishing here is sign in as somebody else — and there was no
            * button for it anywhere on the page.
            */}
          <form action={signOut}>
            <button type="submit" className="btn-ghost">
              Sign out
            </button>
          </form>
        </div>
      </div>

      <Kpis k={kpis} />

      {adding && <NewBusiness trades={trades} onDone={() => setAdding(false)} />}

      <NeedsYou businesses={businesses} />
      <OpenRequests businesses={businesses} />
      <EarlyAccess interest={interest} />

      {/*
        * Search, because fifteen businesses is a scroll and a hundred is not.
        *
        * Matches the business, the owner and the slug: on the phone somebody
        * says their own name far more often than the name above their door.
        */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <input
          value={find}
          onChange={(e) => setFind(e.target.value)}
          placeholder="Find a business, an owner, a number…"
          className="input max-w-sm flex-1"
          aria-label="Find a business"
        />
        <span className="hint">
          {shown.length === businesses.length
            ? `${businesses.length} businesses`
            : `${shown.length} of ${businesses.length}`}
        </span>
      </div>

      {/*
        * A ledger, not a stack of cards.
        *
        * Fifteen white boxes on a paper ground is mostly borders, and the
        * borders are the loudest thing on a screen about businesses. Ruled
        * rows read as a book of accounts, which is what this is.
        */}
      {/*
        * Real businesses and demonstrations, kept apart.
        *
        * They were one list, told apart by a small grey word, and that is the
        * wrong way round: the whole risk of a demo is somebody acting on it as
        * though it were a customer — ringing it, reading its takings, worrying
        * about its week. Real ones first and on their own; the pretend ones
        * below, on their own ground, where nothing can be mistaken for money
        * anybody owes.
        */}
      <div className="card mt-4 px-5 py-1">
        {shown.length === 0 && (
          <p className="hint">
            {businesses.length === 0 ? "Nothing yet. Set the first one up." : "Nobody matches that."}
          </p>
        )}
        {real.map((b) => (
          <Business key={b.id} b={b} />
        ))}
        {real.length === 0 && shown.length > 0 && (
          <p className="hint py-4">No real businesses match that — only demonstrations, below.</p>
        )}
      </div>

      {pretend.length > 0 && (
        <section className="mt-8">
          <div className="flex flex-wrap items-baseline gap-2">
            <h2 className="section-title">Demonstrations</h2>
            <span className="hint">
              {pretend.length} pretend {pretend.length === 1 ? "business" : "businesses"} — made up
              people, made up money, safe to break
            </span>
          </div>
          {/*
            * A different ground and a dashed edge, so it cannot be mistaken at
            * a glance for the ledger above even when somebody is scrolling
            * past it looking for something else.
            */}
          <div className="mt-3 rounded-xl border border-dashed border-accent/40 bg-accent/[0.04] px-5 py-1">
            {pretend.map((b) => (
              <Business key={b.id} b={b} />
            ))}
          </div>
        </section>
      )}

      <Arrivals inbound={inbound} />

      <p className="hint mt-10">
        This screen cannot open a business&rsquo;s conversation, and that is deliberate.
        Every customer of every business here has been told that nobody else on Second
        Pair can read what they wrote. The only messages it shows are the ones sent to our
        own help assistant &mdash; a business owner talking to us, which is nobody&rsquo;s
        customer, and which is checked against the support studio rather than assumed.
      </p>
    </div>
  );
}

/**
 * How the whole thing is doing.
 *
 * This was eight white boxes in a grid, which is what every dashboard on the
 * internet looks like and is mostly borders. The numbers were the smallest
 * thing on a screen that exists to show numbers.
 *
 * Set as a printed page instead: the figures carry it, the labels sit under
 * them in small caps, and the only lines are the rules between columns. The
 * brand is paper and ink, and a page of ruled figures is what a well-kept book
 * of business actually looks like — which is more to the point than another
 * grid of cards.
 *
 * Two rows, not one, because the two halves answer different questions. The
 * first is the business: what is coming in, what it is worth, what it costs.
 * The second is the estate: how many, how healthy, how full.
 */
function Kpis({ k }: { k: PlatformKpis }) {
  const margin = k.wonPence > 0 && k.costPence > 0 ? Math.round(k.wonPence / k.costPence) : null;
  /*
   * Of enquiries, not of everything in the diary.
   *
   * This divided every appointment ever made — including ones typed in by
   * hand, and until today including time off — by the number of conversations,
   * and printed the answer as a percentage. Willow & Co has three hundred
   * appointments and thirteen conversations, so the front page said 2,315% of
   * enquiries book. Now both halves count the same thing.
   */
  const converts = k.enquiries ? Math.round((k.booked / k.enquiries) * 100) : null;

  /*
   * A card around them, ruled inside.
   *
   * Bare rules on the page were cleaner than eight boxes and colder than the
   * rest of the product — the app is warm paper and soft edges, and one screen
   * set like a spreadsheet reads as a different piece of software. The card
   * gives it back its ground; the rules keep the figures reading as a page
   * rather than as tiles.
   */
  return (
    <div className="card mt-8 overflow-hidden p-0">
      <Band>
        <Figure
          value={formatPence(k.mrr)}
          label="Coming in each month"
          note={`${k.paying} paying · ${k.businesses - k.paying} not yet`}
          lead
        />
        <Figure
          value={formatPence(k.wonPence)}
          label="Work it has won them"
          note="Quoted value of everything booked"
        />
        <Figure
          value={formatPence(k.costPence)}
          label="What it cost to run"
          note={margin ? `${margin}× that in work won` : "Every real business, since day one"}
        />
      </Band>

      <Band divided>
        {/*
          * "Paying customers", not "businesses", because that is what it is
          * now counting. Saying "businesses" above a list of fifteen rows
          * showing two would read as a bug rather than as the point.
          */}
        <Figure
          value={String(k.businesses)}
          label="Paying customers"
          note={`${k.live} have had an enquiry · your own and demos not counted`}
        />
        <Figure
          value={String(k.enquiries)}
          label="Enquiries answered"
          note={`Every real business, since day one · ${k.booked} booked by the assistant · ${k.appointments} appointments in all`}
        />
        <Figure
          value={converts == null ? "—" : `${converts}%`}
          label="Enquiries that book"
          note="Of enquiries the assistant answered"
        />
        <Figure
          value={`${k.seatsUsed}/${k.seatsSold}`}
          label="People in use"
          note="Against what has been sold"
          warn={k.seatsUsed > k.seatsSold}
        />
        <Figure
          value={String(k.unfinished)}
          label="Not finished"
          note="Missing a person, a price or hours"
          warn={k.unfinished > 0}
        />
      </Band>
    </div>
  );
}

/**
 * The businesses that want something doing, at the top where they belong.
 *
 * Running this is not reading a list of fifteen and deciding; it is knowing
 * which three need a phone call today. Four things qualify, and each is a
 * different conversation:
 *
 *   - not finished setting up, so it cannot answer anybody
 *   - over the seats they are paying for
 *   - a trial that has run out
 *   - overdue
 *
 * Nothing here when there is nothing to do, which is the point. A panel that
 * is always on screen stops being read.
 */
function NeedsYou({ businesses }: { businesses: BusinessSummary[] }) {
  const today = new Date().toISOString().slice(0, 10);

  const rows = businesses
    .map((b) => {
      /*
       * A demonstration cannot want anything doing.
       *
       * The inferences below are about a business failing its customers — a
       * demo has none, and Second Pair's own studio deliberately has no people
       * or prices, so it sat in the list every day saying it could not answer
       * anybody. A request is different: if somebody has typed one it matters
       * whoever they are.
       */
      const asked = b.tickets.filter((t) => t.status === "open");
      if (b.kind !== "customer" && asked.length === 0) return null;
      // A stopped business cannot want anything doing.
      if (b.archivedAt && asked.length === 0) return null;
      // Put down for a week, and nobody has asked anything since.
      const resting = b.snoozedUntil != null && b.snoozedUntil > today && asked.length === 0;
      if (resting) return null;
      /*
       * Somebody asking beats anything inferred.
       *
       * The other three are guesses from the data — sensible ones, but
       * guesses. A request is a person who has stopped what they were doing to
       * type it, and it goes to the top.
       */
      const waiting = b.tickets.filter((t) => t.status === "open");
      if (waiting.length) {
        return {
          b,
          why: waiting.length === 1 ? `Asked: ${waiting[0].subject}` : `${waiting.length} requests waiting`,
          urgent: true,
        };
      }
      if (!ready(b)) {
        const missing = [
          b.people === 0 ? "nobody added" : null,
          b.services === 0 ? "no prices" : null,
          !b.hasHours ? "no opening hours" : null,
        ].filter(Boolean);
        return { b, why: `Cannot answer anybody — ${missing.join(", ")}`, urgent: false };
      }
      if (b.seatLimit != null && b.people > b.seatLimit) {
        return { b, why: `${b.people} people on a plan for ${b.seatLimit}`, urgent: false };
      }
      if (b.status === "overdue") return { b, why: "Payment overdue", urgent: false };
      if (b.status === "trial" && b.trialEndsOn && b.trialEndsOn < today) {
        return { b, why: "Trial has run out", urgent: false };
      }
      /*
       * A trial with no end date is the one that gets forgotten.
       *
       * The line above only fires once a date has passed, so a business put on
       * trial and never given one sat here indefinitely, costing money to run
       * and never once asking to be turned into a paying customer. It looked
       * like a healthy row on the list. The first real business on the
       * platform was in exactly that state.
       */
      if (b.status === "trial" && !b.trialEndsOn) {
        return { b, why: "On trial with no end date — it will never ask", urgent: false };
      }
      return null;
    })
    .filter((r): r is { b: BusinessSummary; why: string; urgent: boolean } => r !== null)
    .sort((a, b) => Number(b.urgent) - Number(a.urgent));

  const asked = rows.filter((r) => r.urgent).length;

  if (rows.length === 0) return null;

  return (
    <section className="card mt-8 border-l-[3px] border-l-warn p-5">
      {/*
        * A count in the heading, because the panel is read from across the
        * room. "Three want something doing, two of them have asked" is the
        * whole status of the platform in one line, and it means the number is
        * visible without reading the rows underneath it.
        */}
      <h2 className="section-title">
        {rows.length} want{rows.length === 1 ? "s" : ""} something doing
        {asked > 0 && (
          <span className="ml-2 pill bg-warn/10 text-warn">
            {asked} {asked === 1 ? "has" : "have"} asked
          </span>
        )}
      </h2>
      {/*
        * Each line goes to the business it is about.
        *
        * It was a list of problems with no way to act on any of them — you
        * read "Foster Electrical has asked something" and then went hunting
        * for Foster Electrical in fifteen rows underneath.
        */}
      <ul className="mt-2.5 space-y-2.5">
        {rows.map(({ b, why, urgent }) => (
          <li key={b.id} className="flex items-baseline gap-3 py-2 text-sm">
            <a
              href={`#b-${b.id}`}
              className="row flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg"
            >
              <strong>{b.name}</strong>
              <span className={urgent ? "text-foreground" : "text-muted"}>{why}</span>
              {b.ownerPhone && <span className="ml-auto text-muted">{b.ownerPhone}</span>}
              <span aria-hidden className="text-muted">
                &rarr;
              </span>
            </a>
            {/*
              * Only on the guesses. A request is somebody who stopped what
              * they were doing to type it, and it is not something to put
              * down — it is answered or it stays.
              */}
            {!urgent && <Snooze id={b.id} />}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Set up enough to actually answer somebody: a person, a price, and hours. */
const ready = (b: BusinessSummary) => b.people > 0 && b.services > 0 && b.hasHours;

function Business({ b }: { b: BusinessSummary }) {
  const [open, setOpen] = useState(false);
  const owner = b.owners[0]?.email ?? null;

  return (
    /*
     * One business, one object.
     *
     * Nine of these were separated by a hairline and nothing else, and each is
     * a name, an owner, an address and five figures — so the page read as one
     * wall of small print with faint lines through it. Giles: they all blend
     * into one. They do.
     *
     * A card each, and a mark each. The mark is the business's initials in a
     * colour worked out from its own name, which is the same thing the diary
     * and the inbox already do for a person — so a business becomes a thing
     * you recognise from across the page rather than a line you have to read
     * to identify. On a screen that exists to be scanned for the one business
     * that is in trouble, that is most of the job.
     */
    <div
      id={`b-${b.id}`}
      className="card scroll-mt-6 p-4 transition-colors hover:border-accent/25 sm:p-5"
    >
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <span
          className="grid size-10 shrink-0 place-items-center rounded-xl text-[13px] font-bold text-white"
          style={{ background: colourForName(b.name) }}
          aria-hidden
        >
          {initialsOf(b.name)}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold">{b.name}</h2>
            <StatusPill status={b.status} />
            {b.archivedAt && <span className="pill bg-warn/10 text-warn">Stopped</span>}
            {b.kind !== "customer" && (
              /*
                * A demonstration says so in colour, not in grey.
                *
                * Grey is the colour of a detail somebody has already stopped
                * reading, and this is the one label on the row that changes
                * what every figure beside it means.
                */
              <span
                className={
                  b.kind === "demo"
                    ? "pill bg-accent/15 text-accent"
                    : "pill bg-surface-2 text-muted"
                }
              >
                {b.kind === "demo" ? "Pretend" : "Ours"}
              </span>
            )}
            {/* A demonstration cannot be badly set up — there is nobody to fail. */}
            {b.kind === "customer" && !ready(b) && (
              <span className="pill bg-warn/10 text-warn">Not finished</span>
            )}
            {b.seatLimit != null && b.people > b.seatLimit && (
              <span className="pill bg-warn/10 text-warn">Over seats</span>
            )}
            {b.status === "trial" && b.trialEndsOn && (
              <span
                className={`pill ${
                  new Date(b.trialEndsOn) < new Date()
                    ? "bg-warn/10 text-warn"
                    : "bg-surface-2 text-muted"
                }`}
              >
                {new Date(b.trialEndsOn) < new Date() ? "Trial ended" : `Trial to ${new Date(b.trialEndsOn).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`}
              </span>
            )}
            {b.tickets.some((t) => t.status === "open") && (
              <span className="pill bg-warn/10 text-warn">
                {b.tickets.filter((t) => t.status === "open").length} asking
              </span>
            )}
            {b.channels
              .filter((c) => c !== "web")
              .map((c) => (
                <span key={c} className="pill bg-surface-2 text-muted">
                  {c}
                </span>
              ))}
          </div>
          {/*
            * Who to ask for, and how to reach them, without opening anything.
            *
            * An email address is not how you ring somebody whose diary has
            * stopped working on a Saturday, so the phone number is a link you
            * can press.
            */}
          <p className="hint mt-1">
            {b.ownerName ? <strong className="text-foreground">{b.ownerName}</strong> : null}
            {b.ownerName && (owner || b.ownerPhone) ? " · " : ""}
            {owner ? <a href={`mailto:${owner}`} className="hover:underline">{owner}</a> : "no owner attached"}
            {b.ownerPhone ? (
              <>
                {" · "}
                <a href={`tel:${b.ownerPhone.replace(/\s+/g, "")}`} className="hover:underline">
                  {b.ownerPhone}
                </a>
              </>
            ) : null}
          </p>
          <p className="hint mt-0.5">
            /{b.slug}
            {b.plan ? ` · ${b.plan}` : ""}
            {b.planPence > 0 ? ` · ${formatPence(b.planPence)}/mo` : ""}
            {b.quietDays != null && b.quietDays > 14 ? ` · quiet for ${b.quietDays} days` : ""}
          </p>
        </div>

        <button type="button" onClick={() => setOpen((o) => !o)} className="btn-ghost">
          {open ? "Close" : "Manage"}
        </button>
      </div>

      {/*
        * What they have, and what they have not.
        *
        * Three of these being zero is the answer to almost every "it isn't
        * working" call — the assistant cannot offer a time without hours, or a
        * price without rates, or anything at all without a person.
        */}
      {/*
        * A business that books nothing cannot be badly set up for booking.
        *
        * The support assistant is a business in the database — it has an inbox
        * and answers people — and it has no chairs, no price list and no
        * opening hours, because it takes no appointments. Three amber figures
        * said it was broken, every time, for ever. Amber that is always on is
        * amber nobody reads, including on the businesses where it means
        * something.
        *
        * Only our own internal ones. A demonstration with nobody in it is a
        * demonstration that will embarrass somebody, so those keep the warning.
        */}
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-5">
        <Stat label="People" value={b.people} warn={b.kind !== "internal" && b.people === 0} />
        <Stat label="Services" value={b.services} warn={b.kind !== "internal" && b.services === 0} />
        <Stat
          label="Hours"
          value={b.hasHours ? "set" : b.kind === "internal" ? "n/a" : "none"}
          warn={b.kind !== "internal" && !b.hasHours}
        />
        <Stat
          label="Seats"
          value={b.seatLimit == null ? `${b.people} / any` : `${b.people} / ${b.seatLimit}`}
          warn={b.seatLimit != null && b.people > b.seatLimit}
        />
        <Stat label="Enquiries" value={b.conversations} />
      </dl>

      {open && <Manage b={b} owner={owner} />}
    </div>
  );
}

/** Where the account stands, which is the first thing worth knowing. */
/**
 * Every request still in play, across every business.
 *
 * They existed only inside the business they belonged to, folded shut, which
 * meant the only way to know what was outstanding was to open fifteen rows and
 * look. Support work is the one thing on this screen with somebody waiting at
 * the other end of it, and it was the hardest thing on the screen to find.
 *
 * Answered ones stay listed. A reply is not the end of a request — they might
 * come back on it, and a thread nobody has closed is one nobody has agreed is
 * finished. It drops off when it is actually sorted.
 */
function OpenRequests({ businesses }: { businesses: BusinessSummary[] }) {
  const all = businesses.flatMap((b) =>
    b.tickets
      .filter((t) => t.status !== "closed")
      .map((t) => ({ t, b, last: t.messages[t.messages.length - 1] ?? null })),
  );

  if (all.length === 0) return null;

  // Waiting on us first, then oldest first within each — the one that has been
  // waiting longest is the one somebody is most fed up about.
  const order = (x: (typeof all)[number]) => (x.t.status === "open" ? 0 : 1);
  all.sort((a, b) => order(a) - order(b) || (a.last?.at ?? "").localeCompare(b.last?.at ?? ""));

  const waiting = all.filter((x) => x.t.status === "open").length;

  return (
    <section className="card mt-8 p-5">
      <h2 className="section-title">
        {all.length} open {all.length === 1 ? "request" : "requests"}
        {waiting > 0 && (
          <span className="ml-2 pill bg-warn/10 text-warn">{waiting} waiting on you</span>
        )}
      </h2>
      <ul className="mt-2.5 space-y-2.5">
        {all.map(({ t, b, last }) => (
          <li key={t.id} className="py-2 text-sm">
            <a
              href={`#b-${b.id}`}
              className="row flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg"
            >
              {t.status === "open" ? (
                <span className="pill shrink-0 bg-warn/10 text-warn">Waiting</span>
              ) : (
                <span className="pill shrink-0 bg-ok/10 text-ok">Answered</span>
              )}
              <strong className="min-w-0">{t.subject}</strong>
              <span className="text-muted">{b.name}</span>
              {last && <span className="ml-auto shrink-0 text-muted">{since(last.at)}</span>}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** "3 days", the way somebody would say how long something has been sitting. */
function since(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days`;
  return `${Math.floor(days / 7)} weeks`;
}

/** Stopping a business, and starting it again. */
function Stop({ b }: { b: BusinessSummary }) {
  const [state, action] = useActionState<Result, FormData>(archiveBusiness, {});
  const stopped = Boolean(b.archivedAt);

  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="id" value={b.id} />
      {stopped && <input type="hidden" name="restore" value="1" />}
      <button className={`btn ${stopped ? "bg-accent text-on-accent" : "btn-ghost"}`}>
        {stopped ? "Start them up again" : "Stop this business"}
      </button>
      <span className="hint">
        {stopped
          ? `Stopped ${new Date(b.archivedAt as string).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}. Everything of theirs is still here.`
          : "The assistant stops answering. Nothing is deleted, and you can start them again any time."}
      </span>
      {state.note && <span className="hint">{state.note}</span>}
      {state.error && <span className="text-sm text-warn">{state.error}</span>}
    </form>
  );
}

/** A week's peace on something you already know about. */
function Snooze({ id }: { id: string }) {
  const [state, action] = useActionState<Result, FormData>(snoozeAttention, {});
  if (state.ok) return <span className="hint shrink-0">Put down</span>;
  return (
    <form action={action} className="shrink-0">
      <input type="hidden" name="id" value={id} />
      <button className="hint underline-offset-2 hover:underline" title="Hide for a week">
        I know
      </button>
    </form>
  );
}

function StatusPill({ status }: { status: BusinessSummary["status"] }) {
  const look: Record<BusinessSummary["status"], string> = {
    trial: "bg-accent/10 text-accent",
    active: "bg-ok/10 text-ok",
    overdue: "bg-warn/10 text-warn",
    paused: "bg-surface-2 text-muted",
    closed: "bg-surface-2 text-muted",
  };
  const words: Record<BusinessSummary["status"], string> = {
    trial: "Trial",
    active: "Paying",
    overdue: "Overdue",
    paused: "Paused",
    closed: "Closed",
  };
  return <span className={`pill ${look[status]}`}>{words[status]}</span>;
}

function Stat({ label, value, warn }: { label: string; value: number | string; warn?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-muted">{label}</dt>
      <dd className={`num text-base ${warn ? "text-warn" : ""}`}>{value}</dd>
    </div>
  );
}

function Manage({ b, owner }: { b: BusinessSummary; owner: string | null }) {
  const [kind, kindAction] = useActionState<Result, FormData>(setKind, {});
  const [demo, demoAction] = useActionState<Result, FormData>(openDemo, {});
  const [rebuilt, rebuildAction] = useActionState<Result, FormData>(rebuildDemo, {});
  const [reset, resetAction] = useActionState<Result, FormData>(resetLink, {});
  const [gone, deleteAction] = useActionState<Result, FormData>(deleteBusiness, {});
  const [saved, saveAction] = useActionState<Result, FormData>(saveAccount, {});

  return (
    <div className="mt-5 space-y-4 border-t border-border pt-4">
      {/*
        * What this business counts as.
        *
        * The figures at the top are meant to be quotable at somebody, and
        * before this they were not: demonstrations, test junk and Second
        * Pair's own studio were all counted as businesses alongside two real
        * customers. This is the switch that decides.
        */}
      {/*
        * Stopping, which is what "we are done with each other" usually means.
        *
        * Deleting takes every conversation, booking and client with it and
        * cannot be undone, and most reasons for stopping are not permanent — a
        * salon goes quiet over winter, somebody stops paying and then pays. So
        * this is the ordinary action and deletion is the rare one, taken later
        * about something already switched off.
        */}
      <Stop b={b} />

      {/*
        * One click into the demo, which is the only thing this can open.
        *
        * Judging a screen means looking at the same screen as whoever is
        * describing it, and that used to mean building a business, reading a
        * password out and deleting it afterwards — so every conversation about
        * how something looked started with two people looking at different
        * things.
        *
        * Offered only on a demo, and refused again in the action: this signs
        * you in as somebody else, and the entire reason it is safe is that a
        * demo has no real customers in it.
        */}
      {b.kind === "demo" && (
        <form action={demoAction} className="rounded-xl border border-border bg-surface-2/40 p-3.5">
          <input type="hidden" name="id" value={b.id} />

          <div className="min-w-0">
            <div className="text-sm font-medium">Open it, as anybody who works there</div>
            <div className="hint">
              Signed in, straight to the diary. No password, and each link is spent once
              it is used.
            </div>
          </div>

          {/*
            * A button each, rather than one button and a picker.
            *
            * What a salon asks is "what will my stylists see?" and "can they
            * change my prices?", and the answer is four different screens. A
            * dropdown would make choosing between them a decision; four
            * buttons make it a comparison, which is what it is.
            *
            * The value goes on the button rather than a hidden field, so the
            * one pressed is the one that is sent.
            */}
          <div className="mt-3 flex flex-wrap gap-2">
            {(b.views.length
              ? b.views
              : [{ userId: "", label: "The owner", what: "everything" }]
            ).map((v) => (
              <button
                key={v.userId || "owner"}
                name="as"
                value={v.userId}
                className="rounded-xl border border-border bg-surface px-3 py-2 text-left transition-colors hover:border-accent/50"
              >
                <span className="block text-sm font-medium">{v.label}</span>
                <span className="hint">{v.what}</span>
              </button>
            ))}
          </div>

          {demo.link && (
            <a
              href={demo.link}
              className="mt-3 block break-all rounded-lg bg-surface px-3 py-2 text-sm text-accent underline"
            >
              {demo.note ?? "Open"}
            </a>
          )}
          {demo.error && <p className="mt-2 text-sm text-warn">{demo.error}</p>}

          {/*
            * The assistant, beside the diary rather than at the bottom of the
            * card.
            *
            * There has always been an "Open their assistant" link, but it sits
            * under the notes box below every business on the page — fine for
            * checking a customer's widget, useless for the one you reach for
            * in front of somebody. A demonstration is the diary and the widget
            * together: here is the message going in, here is where it lands.
            */}
          <a
            href={`/widget/${b.slug}`}
            target="_blank"
            rel="noreferrer"
            className="mt-3 flex items-center gap-2 text-sm text-accent hover:underline"
          >
            Open the demo assistant
            <span aria-hidden>&rarr;</span>
          </a>
        </form>
      )}

      {/*
        * Putting it back to today.
        *
        * The week is built around this Monday and the inbox is timed in
        * minutes-ago, so a fortnight on it is a salon with an empty diary
        * whose newest enquiry is from last Tuesday. That is worse than no
        * demo: the person being shown it reads the staleness as the product.
        *
        * Next to Open it, because the moment you want this is the moment
        * before you open it.
        */}
      {b.kind === "demo" && (
        <form action={rebuildAction} className="rounded-xl border border-border bg-surface-2/40 p-3.5">
          <div className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="id" value={b.id} />
            <div className="min-w-0">
              <div className="text-sm font-medium">Put it back to today</div>
              <div className="hint">
                Rebuilds this week&rsquo;s appointments and the inbox, all dated from
                now. Nothing else is touched, and it only ever runs on a demo.
              </div>
            </div>
            <button className="btn-ghost ml-auto">Refresh the demo</button>
          </div>

          {rebuilt.note && <p className="mt-2 text-sm text-ok">{rebuilt.note}</p>}
          {rebuilt.error && <p className="mt-2 text-sm text-warn">{rebuilt.error}</p>}
        </form>
      )}

      <form action={kindAction} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="id" value={b.id} />
        <span className="label mb-0">Counts as</span>
        {(["customer", "demo", "internal"] as const).map((k) => (
          <button
            key={k}
            name="kind"
            value={k}
            className={`pill ${
              b.kind === k ? "bg-accent text-on-accent" : "bg-surface-2 text-muted"
            }`}
          >
            {k === "customer" ? "Customer" : k === "demo" ? "Demonstration" : "Ours"}
          </button>
        ))}
        {kind.note && <span className="hint">{kind.note}</span>}
        {kind.error && <span className="text-sm text-warn">{kind.error}</span>}
      </form>

      {/*
        * The commercial arrangement, which exists nowhere else.
        *
        * Seats is the field with teeth. Without a limit an owner adds their
        * whole team and pays the same, which is not a plan. Blank means no
        * limit, which is what every business had before this existed — so
        * nothing changed underneath anybody when it landed.
        */}
      <form action={saveAction} className="grid gap-3 sm:grid-cols-3">
        <input type="hidden" name="id" value={b.id} />
        {/*
          * Who to ring, first. It is the field this screen gets opened for
          * more often than any of the money ones.
          */}
        <label className="block">
          <span className="label">Who to ask for</span>
          <input name="owner_name" defaultValue={b.ownerName ?? ""} className="input" placeholder="Dave" />
        </label>
        <label className="block">
          <span className="label">Phone</span>
          <input
            name="owner_phone"
            inputMode="tel"
            defaultValue={b.ownerPhone ?? ""}
            className="input"
            placeholder="07700 900123"
          />
        </label>
        <label className="block">
          <span className="label">Trial ends</span>
          <input type="date" name="trial_ends" defaultValue={b.trialEndsOn ?? ""} className="input" />
        </label>

        <label className="block">
          <span className="label">Plan</span>
          <input name="plan" defaultValue={b.plan ?? ""} className="input" placeholder="Standard" />
        </label>
        <label className="block">
          <span className="label">£ a month</span>
          <input
            name="price"
            inputMode="decimal"
            defaultValue={b.planPence ? (b.planPence / 100).toFixed(2) : ""}
            className="input"
            placeholder="49.00"
          />
        </label>
        <label className="block">
          <span className="label">Seats</span>
          <input
            name="seats"
            inputMode="numeric"
            defaultValue={b.seatLimit ?? ""}
            className="input"
            placeholder="blank = no limit"
          />
        </label>
        <label className="block">
          <span className="label">Status</span>
          <select name="status" defaultValue={b.status} className="input">
            <option value="trial">Trial</option>
            <option value="active">Paying</option>
            <option value="overdue">Overdue</option>
            <option value="paused">Paused</option>
            <option value="closed">Closed</option>
          </select>
        </label>
        <label className="block">
          <span className="label">Paying since</span>
          <input type="date" name="started" defaultValue={b.billingStartedOn ?? ""} className="input" />
        </label>
        <div className="flex items-end">
          <button type="submit" className="btn bg-accent text-on-accent">
            Save account
          </button>
        </div>
        {/*
          * What they are allowed to use, and therefore what they are paying for.
          *
          * The web widget is not listed: it is always on, it costs nothing
          * extra, and a business without it has nothing. Everything here is a
          * decision somebody made on a call.
          */}
        <fieldset className="sm:col-span-3">
          <legend className="label">Channels authorised</legend>
          <div className="mt-1 flex flex-wrap gap-2">
            {[
              { value: "sms", label: "Text messages" },
              { value: "email", label: "Email" },
              { value: "instagram", label: "Instagram" },
              { value: "whatsapp", label: "WhatsApp" },
              { value: "messenger", label: "Messenger" },
              { value: "voice", label: "Calls" },
            ].map((c) => (
              <label
                key={c.value}
                className="row flex cursor-pointer items-center gap-2 rounded-full border border-border px-3 py-1.5 text-sm has-[:checked]:border-accent has-[:checked]:bg-surface-2"
              >
                <input
                  type="checkbox"
                  name="channel"
                  value={c.value}
                  defaultChecked={b.channels.includes(c.value)}
                  className="size-3.5 accent-[var(--accent)]"
                />
                {c.label}
              </label>
            ))}
          </div>
          <p className="hint mt-1.5">
            The website widget is always on. Anything unticked is refused when a message
            arrives on it, and the owner is told to ask you.
          </p>
        </fieldset>

        <label className="block sm:col-span-3">
          <span className="label">Note to self</span>
          <input
            name="note"
            defaultValue={b.note ?? ""}
            className="input"
            placeholder="Wants SMS once Twilio is through. Ring before the 5th."
          />
        </label>
        {saved.error && <p className="text-sm text-warn sm:col-span-3">{saved.error}</p>}
        {saved.note && <p className="text-sm text-ok sm:col-span-3">{saved.note}</p>}
      </form>

      <div className="flex flex-wrap items-center gap-3">
        <form action={resetAction}>
          <input type="hidden" name="email" value={owner ?? ""} />
          <button type="submit" className="btn-ghost" disabled={!owner}>
            Get them a sign-in link
          </button>
        </form>
        <a href={`/widget/${b.slug}`} target="_blank" rel="noreferrer" className="btn-ghost">
          Open their assistant
        </a>
        <span className="hint">
          Last message{" "}
          {b.lastActivityAt
            ? new Date(b.lastActivityAt).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
              })
            : "never"}
        </span>
      </div>

      <Handover state={reset} />

      {b.tickets.length > 0 && <Requests b={b} />}

      <FixSettings b={b} />

      <Channels b={b} />

      {/* One level down: the settings a support call is usually about. */}
      <Team b={b} />

      {/*
        * Deleting takes real customers' conversations with it, so it asks for
        * the name to be typed. A confirmation that can be dismissed by reflex
        * is not a confirmation.
        */}
      <details className="rounded-xl border border-border p-3">
        <summary className="cursor-pointer text-sm text-muted">Delete this business</summary>
        <form action={deleteAction} className="mt-3 flex flex-wrap items-center gap-2">
          <input type="hidden" name="id" value={b.id} />
          <input
            name="confirm"
            placeholder={b.name}
            className="input w-64"
            aria-label={`Type ${b.name} to confirm`}
          />
          <button type="submit" className="btn bg-warn text-white">
            Delete permanently
          </button>
        </form>
        <p className="hint mt-2">
          Everything of theirs goes: conversations, bookings, clients, settings. Their login
          stays, because a person is not a business.
          {b.kind === "customer"
            ? " A customer has to be stopped before they can be deleted — two decisions, not one."
            : " A demonstration or one of ours goes straight away; there is no relationship to end."}
        </p>
        {gone.error && <p className="mt-2 text-sm text-warn">{gone.error}</p>}
        {gone.note && <p className="mt-2 text-sm text-ok">{gone.note}</p>}
      </details>
    </div>
  );
}

/**
 * What they asked, and answering it.
 *
 * The reply lands in their own account rather than an email, so it is still
 * there in six months when somebody wonders what was agreed — and nobody had to
 * go into their business and read their customers' messages to work out what
 * they meant.
 */
function Requests({ b }: { b: BusinessSummary }) {
  const waiting = b.tickets.filter((t) => t.status !== "closed");
  const sorted = b.tickets.filter((t) => t.status === "closed");

  return (
    <div className="space-y-3">
      {waiting.map((t) => (
        <Request key={t.id} ticket={t} />
      ))}

      {/*
        * What was asked before, kept.
        *
        * Folded away because it is history rather than work, but present —
        * "we had this in March" is worth being able to check, and a support
        * record only the customer can read is not a record.
        */}
      {sorted.length > 0 && (
        <details className="rounded-xl border border-border p-3">
          <summary className="cursor-pointer text-sm text-muted">
            {sorted.length} sorted {sorted.length === 1 ? "request" : "requests"}
          </summary>
          <div className="mt-3 space-y-3">
            {sorted.map((t) => (
              <Request key={t.id} ticket={t} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function Request({ ticket }: { ticket: BusinessSummary["tickets"][number] }) {
  const [state, action] = useActionState<Result, FormData>(answerTicket, {});

  return (
    <div className="rounded-xl border border-border p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <strong className="text-sm">{ticket.subject}</strong>
        {ticket.status === "open" ? (
          <span className="pill bg-warn/10 text-warn">Waiting</span>
        ) : (
          <span className="pill bg-ok/10 text-ok">Answered</span>
        )}
      </div>

      {/*
        * The conversation it came out of, folded away.
        *
        * Folded because the summary above is usually enough and forty messages
        * would bury the reply box. Present because when the summary is not
        * enough, this is the only thing that helps — and until now it did not
        * exist on any screen, so the alternative was writing back to ask
        * somebody what they meant by a sentence the assistant wrote about them.
        */}
      {ticket.origin.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-muted">
            What they were saying ({ticket.origin.length})
          </summary>
          <div className="mt-2 space-y-1.5 border-l-2 border-border pl-3">
            {ticket.origin.map((m) => (
              <p key={m.id} className="whitespace-pre-wrap text-xs">
                <span className="mr-1.5 uppercase tracking-wide text-muted">
                  {m.role === "assistant" ? "Assistant" : m.role === "user" ? "Them" : m.role}
                </span>
                {m.body}
              </p>
            ))}
          </div>
        </details>
      )}

      <div className="mt-3 space-y-2">
        {ticket.messages.map((m) => (
          <p
            key={m.id}
            className={`whitespace-pre-wrap rounded-xl px-3 py-2 text-sm ${
              m.author === "owner" ? "bg-surface-2" : "bg-accent/10"
            }`}
          >
            <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-muted">
              {m.author === "owner" ? "Them" : "You"}
            </span>
            {m.body}
          </p>
        ))}
      </div>

      {/*
        * Two buttons on one form: reply, or reply and be done with it.
        *
        * Most answers are also the end of it, and making somebody send a
        * message and then find a separate close button is how threads stay
        * open for weeks.
        */}
      <form action={action} className="mt-3 space-y-2">
        <input type="hidden" name="ticket_id" value={ticket.id} />
        <textarea name="body" rows={3} className="input w-full" placeholder="Answer them…" />
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" className="btn bg-accent text-on-accent">
            Send
          </button>
          <button
            type="submit"
            name="close"
            value="true"
            className="btn-ghost"
          >
            Send and mark sorted
          </button>
          {state.error && <span className="text-sm text-warn">{state.error}</span>}
          {state.note && <span className="text-sm text-ok">{state.note}</span>}
        </div>
      </form>
    </div>
  );
}

/**
 * Fixing their settings while they are on the phone.
 *
 * The support call is nearly always the same: something is not answering, and
 * the reason is a setting. Talking somebody through their own settings between
 * clients is slow and goes wrong. Doing it while they describe the problem does
 * not.
 *
 * Settings only, and folded away until asked for — this is the panel you open
 * during a call, not something to browse. It cannot reach a conversation, a
 * customer's name or a diary.
 */
/**
 * What is plugged in, and the one bit of it that needs a hand.
 *
 * `channels_allowed` on the account panel is what a business may use.
 * This is what they have actually got, which is a different question and the
 * one a support call is about: somebody authorised for text messages, with no
 * number, is not going to receive a text.
 *
 * Only the phone number is editable, because it is the only channel setup
 * anybody can get wrong on their own. The widget needs nothing. Meta's three
 * are blocked on a review, and when they are not, they will be an OAuth
 * handshake the business does themselves rather than a value anybody types.
 */
function Channels({ b }: { b: BusinessSummary }) {
  const [state, action] = useActionState<Result, FormData>(fixChannel, {});
  const sms = b.connections.find((c) => c.channel === "sms");
  const others = b.connections.filter((c) => c.channel !== "sms");

  /*
   * What we are giving them, and what it costs us.
   *
   * The numbers go inside the subscription, so this is our margin rather than
   * anything a business is billed for. It is also the one cost that grows
   * without anybody doing anything: a rental is charged whether the line is
   * used or not, from the day it is bought until the day it is handed back.
   */
  const supply = supplyOf(
    b.connections
      .filter((c) => c.channel === "sms" || c.channel === "voice")
      .map((c) => ({ externalId: c.externalId, forWho: c.forWho, active: c.active, since: null })),
  );

  return (
    <details className="rounded-xl border border-border p-3">
      {/*
        * Connected, said as connected.
        *
        * This read "Their channels — sms" for a business authorised for all
        * seven, because it lists what is plugged in and the pills on the row
        * above list what is allowed. Two different facts, one of them
        * summarised in a way that reads as the other, and the honest reading
        * of it was "they only have text messages".
        */}
      <summary className="cursor-pointer text-sm text-muted">
        Their channels
        <span className="ml-2 text-xs">
          {b.connections.length === 0
            ? `— none connected, ${b.channels.length} allowed`
            : `— ${b.connections.map((c) => c.channel).join(", ")} connected of ${b.channels.length} allowed`}
        </span>
      </summary>

      <div className="mt-4 space-y-4">
        {/*
          * Said before the form, because it changes what the form means: a
          * number here does nothing at all for a business that is not
          * authorised for texts, and that is not obvious from this panel.
          */}
        {!b.channels.includes("sms") && (
          <p className="text-sm text-warn">
            This business is not authorised for text messages. Add “sms” to their
            channels in the account panel above, or a number here will sit unused.
          </p>
        )}

        <form action={action} className="space-y-3">
          <input type="hidden" name="id" value={b.id} />

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="label">Their Twilio number</span>
              <input
                name="sms_number"
                defaultValue={sms?.externalId ?? ""}
                placeholder="+447700900123"
                className="input"
              />
              <span className="hint">
                Full international form. This is how an incoming text finds them, so a
                number in any other shape matches nothing. A number they already have is
                edited; a new one is added beside it, so a business can be supplied as
                many as it pays for. Empty switches every number on this business off,
                which is not the same as handing them back to Twilio.
              </span>
            </label>

            <label className="block">
              <span className="label">Ring this first, for 15 seconds</span>
              <input
                name="forward_to"
                defaultValue={sms?.forwardTo ?? ""}
                placeholder="+447700900456"
                className="input"
              />
              <span className="hint">
                Their own mobile, never the number above. Empty is a real answer: text
                the caller at once and do not ring anybody.
              </span>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className="btn bg-accent text-on-accent">
              Save their number
            </button>
            {state.ok && <span className="text-sm text-ok">Saved.</span>}
            {state.error && <span className="text-sm text-warn">{state.error}</span>}

            {/*
              * What is actually stored, and when it went in.
              *
              * This panel used to be two boxes and a button, so a number that
              * had been refused looked exactly like a number that had been
              * saved — the boxes still held whatever was typed, either way. A
              * number was bought, typed in here, and believed to be live for a
              * day while nothing was connected at all.
              *
              * So it reports the stored value back rather than the typed one,
              * in the shape a person reads it out, with the moment it saved
              * next to it. "Nothing saved yet" is the line that answers the
              * support call before it is made.
              */}
            <span className="hint ml-auto text-right">
              {sms?.externalId ? (
                <>
                  Stored:{" "}
                  <span className="font-mono">{readableNumber(sms.externalId)}</span>
                  {sms.forwardTo && (
                    <>
                      , rings <span className="font-mono">{readableNumber(sms.forwardTo)}</span>
                    </>
                  )}
                  {" · "}
                  {sms.savedAt ? `saved ${sms.savedAt}` : "saved before this was recorded"}
                </>
              ) : (
                "Nothing saved yet."
              )}
            </span>
          </div>
        </form>

        {/*
          * The two addresses that have to go into Twilio by hand. Shown as
          * text rather than a link: they are pasted into somebody else's
          * dashboard, never followed.
          */}
        <div className="rounded-lg bg-surface-2 p-3">
          <div className="label">Paste these into Twilio, on that number</div>
          <ul className="mt-1 space-y-1 text-sm">
            <li>
              Messaging, a message comes in: <code>https://www.second-pair.com/api/sms/webhook</code>
            </li>
            <li>
              Voice, a call comes in: <code>https://www.second-pair.com/api/voice/webhook</code>
            </li>
          </ul>
          <p className="hint mt-2">
            Both must be POST. Missing the voice one is the quiet failure: texts work,
            and every missed call goes nowhere.
          </p>
        </div>

        {/*
          * The objection you will hear on every call.
          *
          * Somebody with a mobile number on their van is not changing it, and
          * should not be asked to. Both answers keep it; the second has a trap
          * in it that is easier to name here than to diagnose afterwards.
          */}
        <div className="rounded-lg border border-border p-3">
          <div className="label">&ldquo;I&rsquo;m not changing my number&rdquo;</div>
          <p className="hint mt-1">
            They do not have to. Two answers, and the second is the one that catches
            people out.
          </p>
          <ul className="mt-2 space-y-1.5 text-sm text-muted">
            <li>
              <strong className="text-foreground">Give out both.</strong> The new number
              goes on the website and Instagram; the mobile stays for people who have it.
              Ring-me set to their mobile, so the new number rings them first anyway.
            </li>
            <li>
              <strong className="text-foreground">Or divert what they miss.</strong> Their
              network diverts unanswered calls to the number above &mdash; conditional
              diversion, not the plain kind. Customers ring the same number they always
              have, and the missed ones get texted back.
              <br />
              <strong className="text-warn">
                Ring-me must be empty if they do this.
              </strong>{" "}
              Otherwise the call diverts to us, we ring their mobile, their mobile diverts
              it back, and the two pass it between them until it gives up.
            </li>
          </ul>
          <p className="hint mt-2">
            Either way, a <em>text</em> to their own mobile cannot reach the assistant.
            Calls divert; texts do not, on any UK network.
          </p>
        </div>

        {/*
          * Whose each connected thing is, and the way to change it.
          *
          * Giles, asked where he allocates numbers in the back office: he
          * could not. The panel above sets one number for the business and
          * has never recorded whose it is, so the per-person channels the
          * product is built around could not be set up by the one person able
          * to buy a number.
          *
          * Empty means the business's, and that is the default rather than a
          * gap: on a shared line the assistant asks the customer who they
          * would like, and on somebody's own it never asks, because everything
          * arriving there is theirs.
          *
          * Here as well as on the owner's own settings, not instead of it. An
          * owner assigning their own numbers is the normal way round; this is
          * for the owner who would rather not.
          */}
        {b.connections.length > 0 && (
          <div>
            <div className="label">
              Whose each one is
              {supply.live > 0 && (
                <span className="ml-2 font-normal text-muted">
                  {supply.live} number{supply.live === 1 ? "" : "s"} supplied, about{" "}
                  {formatPence(supply.monthlyPence)} a month of ours
                  {supply.off > 0 && `, and ${supply.off} switched off but not handed back`}
                </span>
              )}
            </div>
            <ul className="mt-1.5 space-y-2">
              {b.connections.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="min-w-[8.5rem] font-medium">
                    {c.channel}
                    {c.externalId ? ` ${c.externalId}` : c.label ? ` ${c.label}` : ""}
                  </span>

                  <Whose connection={c.id} artistId={c.artistId} team={b.team} />

                  {/*
                    * And the phone it rings, on the same row.
                    *
                    * Allocating a number and pointing it at somebody's phone
                    * are one job done at one moment, and splitting them across
                    * two screens is how a line ends up allocated and ringing
                    * nowhere. Only where the number can actually take a call:
                    * without voice this is a texting number and a forward is
                    * never read.
                    */}
                  {(c.channel === "sms" || c.channel === "voice") &&
                    b.channels.includes("voice") && (
                      <RingsOn connection={c.id} forwardTo={c.forwardTo} />
                    )}

                  <SwitchLine connection={c.id} active={c.active} />
                </li>
              ))}
            </ul>
            <p className="hint mt-2">
              The business&rsquo;s own line is the one the assistant offers everybody from,
              and it asks who they would like before it books. A line given to somebody
              never asks, because everything arriving on it is theirs.
            </p>
          </div>
        )}

        {others.length > 0 && (
          <div>
            <div className="label">Also connected</div>
            <ul className="mt-1 space-y-1 text-sm text-muted">
              {others.map((c) => (
                <li key={c.id}>
                  {c.channel}
                  {c.label ? ` — ${c.label}` : ""}
                  {c.forWho ? ` · ${c.forWho} only` : " · whole business"}
                  {c.active ? "" : " · switched off"}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </details>
  );
}

/**
 * Who a connected line belongs to.
 *
 * A select rather than a text box: the ids are uuids and this screen can see
 * every business at once, so anything typed is a way to point one salon's
 * number at another salon's stylist. The action checks it as well, because a
 * form is a suggestion.
 */
function Whose({
  connection,
  artistId,
  team,
}: {
  connection: string;
  artistId: string | null;
  team: { id: string; name: string; active: boolean }[];
}) {
  const [state, action] = useActionState<Result, FormData>(assignNumber, {});

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="connection" value={connection} />
      <select
        name="artist"
        defaultValue={artistId ?? ""}
        className="input h-9 w-auto py-1 text-sm"
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
      >
        <option value="">The whole business</option>
        {team
          .filter((t) => t.active || t.id === artistId)
          .map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
              {t.active ? "" : " (not working here)"}
            </option>
          ))}
      </select>
      {state.ok && <span className="text-xs text-ok">Saved.</span>}
      {state.error && <span className="text-xs text-warn">{state.error}</span>}
    </form>
  );
}

/**
 * This one line off, or back on, without touching the others.
 *
 * The number box above holds one number and clearing it used to switch off
 * every line the business had, which is how a stylist's number would disappear
 * because somebody was editing the salon's. Each line answers for itself here.
 *
 * Says what it is before it says what the button does: "switched off" is the
 * fact somebody needs when they are looking at a list, and the button is what
 * they do about it.
 */
function SwitchLine({ connection, active }: { connection: string; active: boolean }) {
  const [state, action] = useActionState<Result, FormData>(switchLine, {});

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="connection" value={connection} />
      <input type="hidden" name="on" value={active ? "0" : "1"} />
      {!active && <span className="text-xs text-warn">switched off</span>}
      <button type="submit" className="btn-ghost h-9 px-2.5 py-1 text-xs">
        {active ? "Switch off" : "Switch back on"}
      </button>
      {state.ok && <span className="text-xs text-ok">Saved.</span>}
      {state.error && <span className="text-xs text-warn">{state.error}</span>}
    </form>
  );
}

/**
 * The phone a line rings before the caller is texted.
 *
 * A text box rather than a select, unlike Whose above, because this is a phone
 * in somebody's pocket and there is no list of them to choose from. Typed the
 * way it is written on a card; the action reads it with the same reader both
 * settings pages use.
 *
 * Empty is a real answer and a common one: nobody is rung and the caller is
 * texted straight away, which is what somebody with their hands full all day
 * actually wants.
 */
function RingsOn({
  connection,
  forwardTo,
}: {
  connection: string;
  forwardTo: string | null;
}) {
  const [state, action] = useActionState<Result, FormData>(setForwarding, {});

  return (
    <form action={action} className="flex flex-wrap items-center gap-1.5">
      <input type="hidden" name="connection" value={connection} />
      <span className="text-xs text-muted">rings</span>
      <input
        name="forward_to"
        defaultValue={forwardTo ?? ""}
        placeholder="nobody"
        className="input h-9 w-40 py-1 font-mono text-sm"
        inputMode="tel"
      />
      <button type="submit" className="btn-ghost h-9 px-2.5 py-1 text-xs">
        Save
      </button>
      {state.ok && <span className="text-xs text-ok">Saved.</span>}
      {state.error && <span className="text-xs text-warn">{state.error}</span>}
    </form>
  );
}

function FixSettings({ b }: { b: BusinessSummary }) {
  const [state, action] = useActionState<Result, FormData>(fixSettings, {});
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const hoursFor = (day: number) =>
    b.settings.hours.find((h) => h.day === day) ?? {
      day,
      open: "09:00",
      close: "17:00",
      closed: false,
    };

  return (
    <details className="rounded-xl border border-border p-3">
      <summary className="cursor-pointer text-sm text-muted">
        Fix their settings for them
      </summary>

      <form action={action} className="mt-4 space-y-4">
        <input type="hidden" name="id" value={b.id} />

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="label">Business name</span>
            <input name="name" defaultValue={b.name} className="input" />
          </label>
          <label className="block">
            <span className="label">Timezone</span>
            <input name="timezone" defaultValue={b.settings.timezone} className="input" />
          </label>
          <label className="block">
            <span className="label">Deposits</span>
            <select name="deposit_mode" defaultValue={b.settings.depositMode} className="input">
              <option value="required">Required</option>
              <option value="optional">Optional</option>
              <option value="none">None</option>
            </select>
          </label>
          <label className="block">
            <span className="label">Who answers first</span>
            <select name="answering_mode" defaultValue={b.settings.answeringMode} className="input">
              <option value="when_free">First refusal while free</option>
              <option value="always_ask_me">First refusal on everything</option>
              <option value="always">Answer everything at once</option>
            </select>
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="label">Head start (minutes)</span>
            <input
              name="first_refusal_minutes"
              inputMode="numeric"
              defaultValue={b.settings.firstRefusalMinutes}
              className="input"
            />
          </label>
          <label className="block">
            <span className="label">Their reply-to email</span>
            <input name="email" defaultValue={b.settings.email ?? ""} className="input" />
          </label>
        </div>

        <label className="block">
          <span className="label">Tone of voice</span>
          <textarea name="tone" defaultValue={b.settings.tone ?? ""} rows={2} className="input" />
        </label>

        <label className="block">
          <span className="label">Opening line in the chat</span>
          <input name="greeting" defaultValue={b.settings.greeting ?? ""} className="input" />
        </label>

        {/*
          * The three lists that shape what it will and will not say. These are
          * what a support call is actually about when somebody rings up saying
          * "it told a customer something it should not have".
          */}
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="label">Always mention</span>
            <textarea
              name="always_mention"
              rows={3}
              defaultValue={b.settings.alwaysMention.join("\n")}
              className="input"
              placeholder="One per line"
            />
          </label>
          <label className="block">
            <span className="label">Never mention</span>
            <textarea
              name="never_mention"
              rows={3}
              defaultValue={b.settings.neverMention.join("\n")}
              className="input"
            />
          </label>
          <label className="block">
            <span className="label">Always hand over when</span>
            <textarea
              name="escalate_when"
              rows={3}
              defaultValue={b.settings.escalateWhen.join("\n")}
              className="input"
            />
          </label>
        </div>

        {/* Money: the rule itself, not just whether there is one. */}
        <div className="grid gap-3 sm:grid-cols-4">
          <label className="block">
            <span className="label">Deposit rule</span>
            <select
              name="deposit_rule_type"
              defaultValue={b.settings.depositRule.type}
              className="input"
            >
              <option value="fixed">Fixed amount</option>
              <option value="percent">Percentage</option>
            </select>
          </label>
          <label className="block">
            <span className="label">Amount (£)</span>
            <input
              name="deposit_amount"
              inputMode="decimal"
              defaultValue={((b.settings.depositRule.amount_pence ?? 0) / 100).toFixed(2)}
              className="input"
            />
          </label>
          <label className="block">
            <span className="label">Percent</span>
            <input
              name="deposit_percent"
              inputMode="numeric"
              defaultValue={b.settings.depositRule.percent ?? 0}
              className="input"
            />
          </label>
          <label className="block">
            <span className="label">Floor (£)</span>
            <input
              name="deposit_floor"
              inputMode="decimal"
              defaultValue={((b.settings.depositRule.min_pence ?? 0) / 100).toFixed(2)}
              className="input"
            />
          </label>
        </div>

        <label className="block">
          <span className="label">Cancellation policy</span>
          <textarea
            name="cancellation_policy"
            rows={2}
            defaultValue={b.settings.cancellationPolicy}
            className="input"
          />
        </label>

        {/* Timing, which is most of "it offered a stupid slot". */}
        <div className="grid gap-3 sm:grid-cols-4">
          <label className="block">
            <span className="label">Notice (hours)</span>
            <input
              name="notice_hours"
              inputMode="numeric"
              defaultValue={b.settings.noticeHours}
              className="input"
            />
          </label>
          <label className="block">
            <span className="label">Consultation (min)</span>
            <input
              name="consultation_minutes"
              inputMode="numeric"
              defaultValue={b.settings.consultationMinutes}
              className="input"
            />
          </label>
          <label className="block">
            <span className="label">Longest session (min)</span>
            <input
              name="max_session_minutes"
              inputMode="numeric"
              defaultValue={b.settings.maxSessionMinutes}
              className="input"
            />
          </label>
          <label className="block">
            <span className="label">Travel buffer (min)</span>
            <input
              name="travel_buffer_minutes"
              inputMode="numeric"
              defaultValue={b.settings.travelBufferMinutes}
              className="input"
            />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="label">Where the work happens</span>
            <select name="travel_mode" defaultValue={b.settings.travelMode} className="input">
              <option value="at_premises">They come to us</option>
              <option value="at_customer">We go to them</option>
              <option value="both">Both</option>
            </select>
          </label>
          <label className="block">
            <span className="label">Areas covered</span>
            <textarea
              name="service_areas"
              rows={2}
              defaultValue={b.settings.serviceAreas.join("\n")}
              className="input"
              placeholder="One per line"
            />
          </label>
        </div>

        {/* VAT changes every price the assistant says out loud. */}
        <div className="grid gap-3 sm:grid-cols-4">
          <label className="row flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm">
            <input
              type="checkbox"
              name="vat_registered"
              defaultChecked={b.settings.vatRegistered}
              className="accent-[var(--accent)]"
            />
            VAT registered
          </label>
          <label className="row flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm">
            <input
              type="checkbox"
              name="prices_include_vat"
              defaultChecked={b.settings.pricesIncludeVat}
              className="accent-[var(--accent)]"
            />
            Prices include it
          </label>
          <label className="block">
            <span className="label">VAT rate %</span>
            <input
              name="vat_rate_percent"
              inputMode="numeric"
              defaultValue={b.settings.vatRatePercent}
              className="input"
            />
          </label>
          <label className="block">
            <span className="label">VAT number</span>
            <input name="vat_number" defaultValue={b.settings.vatNumber ?? ""} className="input" />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="label">Privacy notice URL</span>
            <input
              name="privacy_notice_url"
              defaultValue={b.settings.privacyNoticeUrl ?? ""}
              className="input"
            />
          </label>
          <label className="block">
            <span className="label">Terms URL</span>
            <input name="terms_url" defaultValue={b.settings.termsUrl ?? ""} className="input" />
          </label>
          <label className="block">
            <span className="label">Stripe account</span>
            <input
              name="stripe_account_id"
              defaultValue={b.settings.stripeAccountId ?? ""}
              className="input"
              placeholder="acct_…"
            />
          </label>
        </div>

        {/*
          * Opening hours, because this is the setting that breaks most often —
          * an assistant with none cannot offer a time, and that is the product.
          */}
        <fieldset>
          <legend className="label">Opening hours</legend>
          <div className="mt-1 space-y-1.5">
            {[1, 2, 3, 4, 5, 6, 0].map((day) => {
              const h = hoursFor(day);
              return (
                <div key={day} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <input type="hidden" name="day" value={day} />
                  <span className="w-24 shrink-0 text-muted">{days[day]}</span>
                  <input type="time" name={`open_${day}`} defaultValue={h.open} className="input w-[6.75rem]" />
                  <span className="text-muted">to</span>
                  <input type="time" name={`close_${day}`} defaultValue={h.close} className="input w-[6.75rem]" />
                  <label className="flex items-center gap-1.5 text-muted">
                    <input
                      type="checkbox"
                      name={`closed_${day}`}
                      defaultChecked={h.closed}
                      className="accent-[var(--accent)]"
                    />
                    Closed
                  </label>
                </div>
              );
            })}
          </div>
        </fieldset>

        <div className="flex items-center gap-3">
          <button type="submit" className="btn bg-accent text-on-accent">
            Save their settings
          </button>
          {state.error && <span className="text-sm text-warn">{state.error}</span>}
          {state.note && <span className="text-sm text-ok">{state.note}</span>}
        </div>

        <p className="hint">
          Changes their account, not yours. Tell them what you changed — software that
          alters somebody&rsquo;s settings without saying so is how trust goes.
        </p>
      </form>
    </details>
  );
}

function NewBusiness({
  trades,
  onDone,
}: {
  trades: { value: string; label: string }[];
  onDone: () => void;
}) {
  const [state, action] = useActionState<Result, FormData>(createBusiness, {});

  return (
    <form action={action} className="card mt-5 space-y-4 p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="label">Business name</span>
          <input name="name" required className="input" placeholder="Bell Lane Hair" />
        </label>
        <label className="block">
          <span className="label">Owner&rsquo;s email</span>
          <input
            name="email"
            type="email"
            required
            className="input"
            placeholder="nadia@belllanehair.co.uk"
          />
        </label>
        <label className="block">
          <span className="label">Owner&rsquo;s name</span>
          <input name="owner" className="input" placeholder="Nadia" />
        </label>
        <label className="block">
          <span className="label">Trade</span>
          <select name="vertical" className="input" defaultValue="general">
            {trades.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" className="btn bg-accent text-on-accent">
          Set it up
        </button>
        <button type="button" onClick={onDone} className="btn-ghost">
          Cancel
        </button>
      </div>

      <Handover state={state} />
    </form>
  );
}

/**
 * The one-use link, shown rather than emailed.
 *
 * On purpose: this is used while somebody is on the phone, and a link that has
 * to arrive by email depends on our sending being set up and their spam filter
 * being kind. Reading it out or pasting it into a text works today.
 */
function Handover({ state }: { state: Result }) {
  if (!state.error && !state.note) return null;

  return (
    <div className="space-y-2">
      {state.error && <p className="text-sm text-warn">{state.error}</p>}
      {state.note && <p className="text-sm text-ok">{state.note}</p>}
      {state.link && (
        <textarea
          readOnly
          rows={2}
          value={state.link}
          onFocus={(e) => e.currentTarget.select()}
          className="input w-full font-mono text-xs"
          aria-label="One-use sign-in link"
        />
      )}
    </div>
  );
}

export type Waiting = {
  id: string;
  product: string;
  email: string;
  name: string | null;
  note: string | null;
  source: string | null;
  at: string;
  toldAt: string | null;
};

/**
 * People waiting to hear that something of ours is ready.
 *
 * The marketing site has had a form for this since Family APP! went on the
 * page, and it writes to a table nothing could read. An email came to us on
 * each signup and that was the whole of it — miss one, or have it land in
 * spam, and somebody who asked to hear from us was gone with no way to find
 * out they existed. The column that stops a launch email arriving twice could
 * never be set, because nothing could see the rows to set it.
 *
 * Absent entirely while nobody has asked. An empty panel headed "early access"
 * on a screen about running businesses is furniture, and this screen already
 * says what it is for.
 */
function EarlyAccess({ interest }: { interest: Waiting[] }) {
  if (interest.length === 0) return null;

  const products = [...new Set(interest.map((w) => w.product))];

  return (
    <section className="card mt-6 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="section-title">Waiting to hear</h2>
        <span className="hint">
          {interest.length} {interest.length === 1 ? "person" : "people"}
        </span>
      </div>

      <div className="mt-4 space-y-5">
        {products.map((product) => (
          <Product key={product} product={product} rows={interest.filter((w) => w.product === product)} />
        ))}
      </div>
    </section>
  );
}

function Product({ product, rows }: { product: string; rows: Waiting[] }) {
  const [state, action] = useActionState<Result, FormData>(markTold, {});
  const untold = rows.filter((r) => !r.toldAt);

  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-3">
        <strong className="text-sm">{product}</strong>
        <span className="hint">
          {untold.length === 0
            ? "everybody has been written to"
            : `${untold.length} not written to yet`}
        </span>
      </div>

      <ul className="mt-2 divide-y divide-border border-y border-border">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2 text-sm">
            <span className="font-medium">{r.name ?? "—"}</span>
            {/*
              * Selectable, because the next thing anybody does with this list
              * is paste it somewhere to write to them.
              */}
            <span className="select-all font-mono text-xs">{r.email}</span>
            <span className="hint ml-auto">{since(r.at)}</span>
            {r.toldAt && <span className="pill bg-ok/10 text-ok">told</span>}
            {r.note && <p className="hint w-full whitespace-pre-wrap">{r.note}</p>}
          </li>
        ))}
      </ul>

      {untold.length > 0 && (
        <form action={action} className="mt-2 flex flex-wrap items-center gap-3">
          <input type="hidden" name="product" value={product} />
          <input type="hidden" name="ids" value={untold.map((r) => r.id).join(",")} />
          <span className="select-all font-mono text-xs">
            {untold.map((r) => r.email).join(", ")}
          </span>
          {/*
            * After the writing, not instead of it. Nothing here sends a launch
            * email — that is a decision about wording and timing rather than a
            * button — so this is pressed by somebody who has just sent one.
            */}
          <button type="submit" className="btn-ghost py-1.5 text-xs">
            I have written to these {untold.length}
          </button>
          {state.error && <span className="text-xs text-warn">{state.error}</span>}
          {state.note && <span className="text-xs text-ok">{state.note}</span>}
        </form>
      )}
    </div>
  );
}

export type Arrived = {
  id: string;
  to: string | null;
  from: string | null;
  subject: string | null;
  verdict: string;
  because: string | null;
  at: string;
};

/**
 * What has reached an inbound address lately.
 *
 * Setting a business up means pointing their real mailbox at an address of
 * ours, and every provider confirms that by emailing a code to the
 * destination. When the code does not turn up there were three possible
 * reasons and no way to tell them apart: it never arrived, it arrived and was
 * thrown away as a machine talking, or the address named a business that does
 * not exist. Only the first is out of our hands, and it was the one everybody
 * assumed.
 *
 * The subject and the sender, never the body. What somebody wrote to a
 * business is theirs, and none of it is needed to answer the question this
 * exists for.
 */
function Arrivals({ inbound }: { inbound: Arrived[] }) {
  /*
   * Shown even when there is nothing in it, which is the opposite of the rule
   * every other panel here follows.
   *
   * Empty is not "nothing to report" on this one — it is the answer. Somebody
   * looks at this precisely because a provider says it has sent a code and
   * none has appeared, and hiding the panel at that moment leaves them
   * searching the back office for a thing that is deliberately invisible. The
   * sentence at the bottom is the whole point of it.
   */
  const colour = (verdict: string) =>
    verdict === "answered"
      ? "bg-ok/10 text-ok"
      : verdict === "parked"
        ? "bg-accent/10 text-accent"
        : "bg-warn/10 text-warn";

  /*
   * Something addressed to a business that does not exist, which is almost
   * always a slug typed wrong while setting a forward up. The one state here
   * worth noticing without being asked.
   */
  const wrong = inbound.filter((row) => row.verdict === "refused").length;

  return (
    /*
     * Folded, and near the bottom.
     *
     * This is looked at twice in a business's life — while its forwarding is
     * being set up, and when somebody says an email went missing. A panel for
     * that does not belong above the businesses, and a list of what arrived
     * today is not something anybody should have to scroll past to reach the
     * work. Open only when something was addressed to nobody, which is the one
     * state here that is a fault rather than a record.
     */
    <details className="card mt-6 p-5" open={wrong > 0}>
      <summary className="cursor-pointer">
        <span className="section-title">Mail arriving at our addresses</span>
        <span className="hint ml-2">
          {wrong > 0
            ? `${wrong} addressed to nobody`
            : inbound.length === 0
              ? "nothing yet"
              : `${inbound.length} recent`}
        </span>
      </summary>

      {inbound.length === 0 && (
        <p className="hint mt-2">
          Nothing has reached an inbound address yet.
        </p>
      )}

      <ul className="mt-3 divide-y divide-border border-y border-border empty:hidden empty:border-0">
        {inbound.map((row) => (
          <li key={row.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2 text-sm">
            <span className={`pill shrink-0 ${colour(row.verdict)}`}>{row.verdict}</span>
            {/*
              * Blank where it was somebody writing to a business.
              *
              * Their mail is theirs. What is kept is that it arrived and what
              * was decided, which answers the only question this exists for —
              * is the address working — without a back office that can read
              * every customer's subject line.
              */}
            <span className="font-mono text-xs">
              {row.from ?? <span className="hint not-italic">a person, not recorded</span>}
            </span>
            <span className="hint ml-auto">{since(row.at)}</span>
            <span className="w-full min-w-0">
              {row.subject && <span className="block truncate">{row.subject}</span>}
              <span className="hint block truncate">
                to {row.to ?? "an address with no business behind it"}
                {row.because ? ` — ${row.because}` : ""}
              </span>
            </span>
          </li>
        ))}
      </ul>

      <p className="hint mt-2">
        Every email reaching <span className="font-mono text-xs">@in.second-pair.com</span>{" "}
        leaves a line here, so &ldquo;did it arrive&rdquo; always has an answer. Only the
        ones that are <strong>ours</strong> keep a sender and a subject &mdash; a
        verification code, or mail to an address with no business behind it. A customer
        writing to a business records that it happened and nothing else: their mail is
        theirs, and it is in that business&rsquo;s own inbox where it belongs. Kept a
        month, then deleted.
      </p>
      <p className="hint mt-1">
        Sent something and it is <em>not</em> here at all? It never reached us. Look in
        Resend&rsquo;s own received log, which is upstream of this.
      </p>
    </details>
  );
}
