"use client";

import { useActionState, useState } from "react";
import { raiseTicket, replyToTicket, type FormState } from "./actions";
import { Waiting } from "@/components/Waiting";

type Message = { id: string; author: "owner" | "support"; body: string; at: string };
type Ticket = {
  id: string;
  subject: string;
  status: "open" | "answered" | "closed";
  createdAt: string;
  messages: Message[];
};

const when = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/**
 * The help thread, written to be opened by somebody who is annoyed.
 *
 * Whoever is here has a problem, probably mid-day, probably between clients. So
 * the box to write in is the first thing on the page rather than something to
 * find, and every reply says plainly whether it is still waiting on us.
 */
export function Tickets({ tickets }: { tickets: Ticket[] }) {
  const [state, action] = useActionState<FormState, FormData>(raiseTicket, {});
  const [asking, setAsking] = useState(tickets.length === 0);

  const open = tickets.filter((t) => t.status !== "closed");
  const done = tickets.filter((t) => t.status === "closed");

  return (
    <div className="mx-auto max-w-3xl px-6 py-9 sm:px-8">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
        <h1 className="page-title">Help</h1>
        <span className="hint">A person reads these. Usually the same day.</span>
        {!asking && (
          <button
            type="button"
            onClick={() => setAsking(true)}
            className="btn-ghost ml-auto"
          >
            Write to a person
          </button>
        )}
      </div>

      {/*
        * The assistant first, because it is faster and it is usually enough.
        *
        * Most of what arrives here is answerable from what the product already
        * knows — where a setting lives, why a reminder did not send, how to
        * charge a deposit. Waiting until tomorrow for that is a bad trade when
        * the answer exists now, and every one of those that becomes a request
        * is one somebody has to read and reply to by hand.
        *
        * It is a suggestion and not a gate. Somebody who has already tried,
        * or who knows perfectly well they need a human, should not have to
        * argue with a robot first to reach one.
        */}
      <div className="card mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 p-5">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">Try the assistant first</div>
          <p className="hint mt-0.5">
            It answers most things straight away, and it knows how all of this works. If
            it cannot help, it raises a request here for you — you will not have to write
            it out twice.
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("second-pair:help"))}
          className="btn shrink-0 bg-accent text-on-accent"
        >
          Ask the assistant
        </button>
      </div>

      {asking && (
        <form action={action} className="card mt-5 space-y-4 p-5">
          <label className="block">
            <span className="label">What is it about?</span>
            <input
              name="subject"
              required
              className="input"
              placeholder="Reminders are not going out"
            />
          </label>
          <label className="block">
            <span className="label">What is happening?</span>
            <textarea
              name="body"
              required
              rows={4}
              className="input"
              placeholder="Tell us what you did, what you expected, and what happened instead. If it is about one customer, their first name is enough — we cannot see your messages."
            />
          </label>
          <div className="flex items-center gap-3">
            <button type="submit" className="btn bg-accent text-on-accent">
              Send it
            </button>
            {tickets.length > 0 && (
              <button type="button" onClick={() => setAsking(false)} className="btn-ghost">
                Cancel
              </button>
            )}
            {state.error && <span className="text-sm text-warn">{state.error}</span>}
          </div>
          {/*
            * Said here rather than buried in a policy.
            *
            * Somebody about to describe a problem needs to know we cannot see
            * their conversations — otherwise they write "the one from
            * Tuesday" and wait for an answer nobody can give.
            */}
          <p className="hint">
            We cannot read your customers&rsquo; messages, so tell us anything we need to
            know about them here.
          </p>
        </form>
      )}

      {tickets.length === 0 && !asking && (
        <div className="card empty mt-5">
          <Waiting className="mx-auto mb-4 size-14" />
          <div className="empty-title">Nothing open</div>
          <p className="empty-body">
            Anything you ask lands with a person, and the whole conversation stays here so
            you can look it up later.
          </p>
        </div>
      )}

      <div className="mt-6 space-y-3">
        {open.map((t) => (
          <Thread key={t.id} ticket={t} />
        ))}
      </div>

      {done.length > 0 && (
        <details className="mt-8">
          <summary className="hint cursor-pointer">
            {done.length} sorted {done.length === 1 ? "request" : "requests"}
          </summary>
          <div className="mt-3 space-y-3">
            {done.map((t) => (
              <Thread key={t.id} ticket={t} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function Thread({ ticket }: { ticket: Ticket }) {
  const [state, action] = useActionState<FormState, FormData>(replyToTicket, {});
  const [open, setOpen] = useState(ticket.status === "answered");

  return (
    <div className="card p-5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="row flex w-full items-start gap-3 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{ticket.subject}</span>
          <span className="hint mt-0.5 block">
            Asked {when(ticket.createdAt)} · {ticket.messages.length}{" "}
            {ticket.messages.length === 1 ? "message" : "messages"}
          </span>
        </span>
        <Status status={ticket.status} />
      </button>

      {open && (
        <div className="mt-4 space-y-3 border-t border-border pt-4">
          {ticket.messages.map((m) => (
            <div
              key={m.id}
              className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                m.author === "owner"
                  ? "ml-auto rounded-br-sm bg-accent text-on-accent"
                  : "rounded-tl-sm bg-surface-2"
              }`}
            >
              <span className="whitespace-pre-wrap">{m.body}</span>
              <span
                className={`mt-1 block text-[10px] ${
                  m.author === "owner" ? "text-on-accent/70" : "text-muted"
                }`}
              >
                {m.author === "owner" ? "You" : "Second Pair"} · {when(m.at)}
              </span>
            </div>
          ))}

          <form action={action} className="flex items-end gap-2 pt-1">
            <input type="hidden" name="ticket_id" value={ticket.id} />
            <textarea
              name="body"
              rows={2}
              className="input flex-1"
              placeholder={ticket.status === "closed" ? "Reopen this…" : "Add something…"}
            />
            <button type="submit" className="btn-ghost">
              Send
            </button>
          </form>
          {state.error && <p className="text-sm text-warn">{state.error}</p>}
        </div>
      )}
    </div>
  );
}

function Status({ status }: { status: Ticket["status"] }) {
  if (status === "answered") return <span className="pill bg-ok/10 text-ok">Answered</span>;
  if (status === "closed") return <span className="pill bg-surface-2 text-muted">Sorted</span>;
  return <span className="pill bg-accent/10 text-accent">With us</span>;
}
