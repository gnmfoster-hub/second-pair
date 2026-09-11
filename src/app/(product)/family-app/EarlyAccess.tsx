"use client";

import { useActionState } from "react";
import { registerInterest, type InterestState } from "../actions";

/**
 * The only thing this page asks for.
 *
 * Family APP! is on neither app store — Android is a direct download, iOS is
 * TestFlight — so there is nothing honest to put behind a "Get it now" button.
 * Saying where it really is and offering to tell somebody when that changes is
 * both true and the thing that builds a list before launch day.
 *
 * The state it is in is said plainly above the box rather than hidden in small
 * print underneath. Somebody who signs up expecting an instant download and
 * gets an email in three months has been mildly lied to, and that is a poor
 * first impression of a company with another product to sell them.
 */
export function EarlyAccess() {
  const [state, action, pending] = useActionState<InterestState, FormData>(
    registerInterest,
    {},
  );

  if (state.ok) {
    return (
      <div className="fa-card p-6">
        <h2 className="text-[1.15rem] font-semibold">You are on the list</h2>
        <p className="mt-2 text-[0.95rem] leading-[1.55]" style={{ color: "var(--fa-ink-soft)" }}>
          We will write once, when there is something to open. Not a newsletter, and
          nobody else gets your address.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="fa-card p-6">
      <h2 className="text-[1.15rem] font-semibold">Get early access</h2>

      <p className="mt-2 text-[0.9rem] leading-[1.5]" style={{ color: "var(--fa-ink-soft)" }}>
        It is not on Google Play or the App Store yet &mdash; it is in daily use by the
        family it was built for while the rough edges come off. Leave your address and
        you will hear the day that changes.
      </p>

      <input type="hidden" name="product" value="Family APP!" />
      <input type="hidden" name="source" value="/family-app" />

      {/*
        * A field no person can see and most bots fill in. Hidden from assistive
        * technology as well, so it is invisible to a screen reader rather than
        * a mysterious unlabelled box.
        */}
      <div className="absolute left-[-9999px]" aria-hidden>
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <label className="mt-4 block">
        <span className="text-[0.8rem] font-semibold">Your email</span>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          className="mt-1 w-full rounded-lg border px-3 py-2.5 text-[0.95rem]"
          style={{
            borderColor: "var(--fa-line)",
            background: "var(--fa-paper)",
            color: "var(--fa-ink)",
          }}
        />
      </label>

      <label className="mt-3 block">
        <span className="text-[0.8rem] font-semibold">
          Your name <span style={{ color: "var(--fa-ink-faint)" }}>— optional</span>
        </span>
        <input
          name="name"
          autoComplete="name"
          className="mt-1 w-full rounded-lg border px-3 py-2.5 text-[0.95rem]"
          style={{
            borderColor: "var(--fa-line)",
            background: "var(--fa-paper)",
            color: "var(--fa-ink)",
          }}
        />
      </label>

      {state.error && (
        <p className="mt-3 text-[0.88rem]" style={{ color: "var(--fa-berry)" }}>
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-4 w-full rounded-xl px-4 py-3 text-[0.98rem] font-bold transition-[filter] hover:brightness-95 disabled:opacity-60"
        style={{ background: "var(--fa-marigold)", color: "#2b2420" }}
      >
        {pending ? "One moment…" : "Tell me when it's ready"}
      </button>

      <p className="mt-3 text-[0.78rem] leading-[1.45]" style={{ color: "var(--fa-ink-faint)" }}>
        One email, when there is one to send. No newsletter, no sharing your address, and
        unsubscribing is replying to say so.
      </p>
    </form>
  );
}
