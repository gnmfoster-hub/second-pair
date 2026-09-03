"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { signOut } from "@/app/(dashboard)/actions";
import type { BusinessSummary } from "@/lib/platform";
import {
  createBusiness,
  resetLink,
  deleteBusiness,
  saveAccount,
  fixSettings,
  answerTicket,
  setKind,
  snoozeAttention,
  type Result,
} from "./actions";
import { formatPence } from "@/lib/money";
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
}: {
  kpis: PlatformKpis;
  businesses: BusinessSummary[];
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
      <div className="card mt-4 px-5 py-1">
        {shown.length === 0 && (
          <p className="hint">
            {businesses.length === 0 ? "Nothing yet. Set the first one up." : "Nobody matches that."}
          </p>
        )}
        {shown.map((b) => (
          <Business key={b.id} b={b} />
        ))}
      </div>

      <p className="hint mt-10">
        This screen cannot open a conversation, and that is deliberate. Every customer of
        every business here has been told that nobody else on Second Pair can read what
        they wrote.
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
          note={margin ? `${margin}× that in work won` : "Across every business"}
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
          note={`${k.live} have had an enquiry · demos not counted`}
        />
        <Figure value={String(k.enquiries)} label="Enquiries answered" note={`${k.booked} booked in`} />
        <Figure
          value={converts == null ? "—" : `${converts}%`}
          label="Enquiries that book"
          note="Across the platform"
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

/** A row of figures, ruled between rather than boxed. */
function Band({ children, divided }: { children: React.ReactNode; divided?: boolean }) {
  return (
    <div
      className={`grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] ${
        divided ? "border-t border-border" : ""
      }`}
    >
      {children}
    </div>
  );
}

/**
 * One figure, set like print.
 *
 * The number first and large, the label under it in small caps, the note
 * quieter still. Three sizes of the same information, which is what makes a
 * page readable at a glance rather than only when studied.
 */
function Figure({
  value,
  label,
  note,
  lead,
  warn,
}: {
  value: string;
  label: string;
  note?: string;
  /** The one figure the page is about. */
  lead?: boolean;
  warn?: boolean;
}) {
  /*
   * Painted on the card's own surface, not the page behind it.
   *
   * These paint a background so the one-pixel gaps between them show as rules
   * — but painting the paper colour put the page back on top of the card and
   * made the card invisible. It has to be the surface the card is drawn in.
   */
  return (
    <div className="bg-surface px-5 py-5">
      <div
        className={`font-display font-bold tabular-nums leading-none tracking-[-0.03em] ${
          lead ? "text-4xl" : "text-2xl"
        } ${warn ? "text-warn" : lead ? "text-highlight-strong" : ""}`}
      >
        {value}
      </div>
      <div className="mt-2.5 text-[11px] font-semibold uppercase tracking-[0.09em] text-muted">
        {label}
      </div>
      {note && <div className="mt-1 text-[12px] leading-snug text-muted/80">{note}</div>}
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
      <ul className="mt-2.5 divide-y divide-border">
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
    <div id={`b-${b.id}`} className="scroll-mt-6 border-b border-border py-5 last:border-b-0">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold">{b.name}</h2>
            <StatusPill status={b.status} />
            {b.kind !== "customer" && (
              <span className="pill bg-surface-2 text-muted">
                {b.kind === "demo" ? "Demo" : "Ours"}
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
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-5">
        <Stat label="People" value={b.people} warn={b.people === 0} />
        <Stat label="Services" value={b.services} warn={b.services === 0} />
        <Stat label="Hours" value={b.hasHours ? "set" : "none"} warn={!b.hasHours} />
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
      <ul className="mt-2.5 divide-y divide-border">
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
