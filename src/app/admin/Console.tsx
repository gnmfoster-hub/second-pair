"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import type { BusinessSummary } from "@/lib/platform";
import { createBusiness, resetLink, deleteBusiness, saveAccount, type Result } from "./actions";
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
        <button
          type="button"
          onClick={() => setAdding((a) => !a)}
          className="btn ml-auto bg-highlight text-on-highlight"
        >
          {adding ? "Not now" : "Set one up"}
        </button>
      </div>

      <Kpis k={kpis} />

      {adding && <NewBusiness trades={trades} onDone={() => setAdding(false)} />}

      <div className="mt-6 space-y-3">
        {businesses.length === 0 && (
          <p className="hint">Nothing yet. Set the first one up.</p>
        )}
        {businesses.map((b) => (
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
 * How the whole thing is doing, in one line of cards.
 *
 * Two audiences in the same panel and they want different halves. The money
 * across the top is the business: what is coming in, from how many, and how
 * many are still on trial. Underneath is the case you make to the next
 * customer — what the assistant has actually won for people, and what it cost
 * to do it. That second pair is the sales argument, and it has to be true, so
 * it is counted rather than estimated.
 */
function Kpis({ k }: { k: PlatformKpis }) {
  const margin = k.wonPence > 0 && k.costPence > 0 ? Math.round(k.wonPence / k.costPence) : null;

  return (
    <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Kpi
        tone="headline"
        value={formatPence(k.mrr)}
        label="Coming in each month"
        detail={`${k.paying} paying · ${k.businesses - k.paying} not yet`}
      />
      <Kpi
        value={formatPence(k.wonPence)}
        label="Work it has won them"
        detail="Quoted value of everything the assistant booked"
      />
      <Kpi
        value={String(k.enquiries)}
        label="Enquiries answered"
        detail={`${k.booked} of them booked in`}
      />
      <Kpi
        value={formatPence(k.costPence)}
        label="What it cost to run"
        detail={margin ? `${margin}× that in work won` : "Across every business"}
      />
      <Kpi
        value={`${k.seatsUsed}/${k.seatsSold}`}
        label="People in use"
        detail="Against what has been sold"
        warn={k.seatsUsed > k.seatsSold}
      />
      <Kpi value={String(k.businesses)} label="Businesses" detail={`${k.live} have had an enquiry`} />
      <Kpi
        value={String(k.unfinished)}
        label="Not finished setting up"
        detail="Missing a person, a price or hours"
        warn={k.unfinished > 0}
      />
      <Kpi
        value={k.businesses ? Math.round((k.booked / Math.max(1, k.enquiries)) * 100) + "%" : "—"}
        label="Enquiries that book"
        detail="Across the platform"
      />
    </div>
  );
}

function Kpi({
  value,
  label,
  detail,
  tone,
  warn,
}: {
  value: string;
  label: string;
  detail?: string;
  tone?: "headline";
  warn?: boolean;
}) {
  return (
    <div className={`card p-4 ${tone === "headline" ? "border-highlight/40" : ""}`}>
      <div
        className={`font-display text-2xl font-bold tabular-nums leading-none ${
          warn ? "text-warn" : tone === "headline" ? "text-highlight-strong" : ""
        }`}
      >
        {value}
      </div>
      <div className="mt-1.5 text-sm font-medium">{label}</div>
      {detail && <div className="hint mt-0.5">{detail}</div>}
    </div>
  );
}

/** Set up enough to actually answer somebody: a person, a price, and hours. */
const ready = (b: BusinessSummary) => b.people > 0 && b.services > 0 && b.hasHours;

function Business({ b }: { b: BusinessSummary }) {
  const [open, setOpen] = useState(false);
  const owner = b.owners[0]?.email ?? null;

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold">{b.name}</h2>
            <StatusPill status={b.status} />
            {!ready(b) && <span className="pill bg-warn/10 text-warn">Not finished</span>}
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
  const [reset, resetAction] = useActionState<Result, FormData>(resetLink, {});
  const [gone, deleteAction] = useActionState<Result, FormData>(deleteBusiness, {});
  const [saved, saveAction] = useActionState<Result, FormData>(saveAccount, {});

  return (
    <div className="mt-5 space-y-4 border-t border-border pt-4">
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
