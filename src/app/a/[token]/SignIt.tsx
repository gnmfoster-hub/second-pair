"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";
import { SignatureBox } from "@/components/SignatureBox";
import { signAgreement, markAgreementOpened, type SignState } from "./actions";

/**
 * Reading the agreement, and signing it.
 *
 * The wording is rendered exactly as it was sent, as one block of text, because
 * that string is the document. Nothing here reformats it, summarises it, or
 * adds a figure of its own: what is on the screen is what is in the row, so
 * there is never a question of which version somebody agreed to.
 */
export function SignIt({
  token,
  terms,
  version,
  /** Who it was sent to, so the email box starts filled in. */
  sentTo,
}: {
  token: string;
  terms: string;
  version: string;
  sentTo: string | null;
}) {
  const [state, action, pending] = useActionState<SignState, FormData>(signAgreement, {});
  const top = useRef<HTMLDivElement>(null);
  const [, startTransition] = useTransition();

  /*
   * Opened is recorded from the browser rather than when the page renders.
   *
   * The same reason the consent form does it this way: WhatsApp, iMessage and
   * Outlook all fetch a link to build a preview, so a server-side write counted
   * the mail client as the business reading their agreement. Knowing whether
   * somebody has actually looked at it is the whole value of the field — it is
   * what tells Giles whether to chase.
   */
  useEffect(() => {
    void markAgreementOpened(token);
  }, [token]);

  /* An error above the fold, because the signature box is a long way down. */
  useEffect(() => {
    if (state.error) top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [state.error]);

  if (state.done) {
    return (
      <div className="card mt-4 p-6 text-center">
        <div className="text-3xl" aria-hidden>
          ✓
        </div>
        <h2 className="mt-2 text-lg font-semibold">Thank you, that is signed</h2>
        <p className="hint mt-2">
          Keep this link. It is your copy of exactly what you signed, and it will not change.
          We will be in touch about getting you set up.
        </p>
      </div>
    );
  }

  return (
    <div ref={top}>
      <p className="hint mt-2 max-w-prose">
        Please read it through. If anything in it is not what we discussed, do not sign it.
        Tell us and we will put it right and send it again.
      </p>

      {state.error && (
        <div
          className="mt-4 rounded-xl border border-warn/40 bg-warn/10 p-4 text-sm text-warn"
          role="alert"
        >
          {state.error}
        </div>
      )}

      {/*
        * The document, exactly as it was sent.
        *
        * whitespace-pre-line because buildTerms lays it out with blank lines and
        * indented bullets and that layout is part of reading it. Deliberately not
        * parsed into headings and lists: the moment this page starts interpreting
        * the string, the thing on the screen stops being the thing in the row.
        */}
      <div className="card mt-4 p-5 sm:p-6">
        <div className="max-w-prose whitespace-pre-line text-[13.5px] leading-relaxed">
          {terms}
        </div>
      </div>

      <form
        /*
         * Submitted by hand rather than with `action={...}`.
         *
         * React clears every field in a form when a form action returns, which on
         * a failed validation would wipe a signature somebody has just drawn.
         * They would have to sign again to find out what was wrong with the first
         * one. The consent form learnt this; this does the same.
         */
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          startTransition(() => action(data));
        }}
        className="card mt-4 space-y-4 p-5 sm:p-6"
      >
        <input type="hidden" name="token" value={token} />

        <div className="section-title">Signing it</div>

        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="agreed"
            className="mt-0.5 size-4 accent-[var(--accent)]"
          />
          <span>
            I have read the agreement above and I agree to it on behalf of my business.
            {version && <span className="hint block">Version {version}.</span>}
          </span>
        </label>

        <label className="block">
          <span className="text-sm font-medium">Your email address</span>
          <span className="hint block">So you have a copy, and so we know who signed.</span>
          <input
            name="signer_email"
            type="email"
            defaultValue={sentTo ?? ""}
            className="input mt-2"
            autoComplete="email"
          />
        </label>

        <SignatureBox
          label="Sign here"
          hint="The name of whoever is signing for the business."
        />

        <button
          type="submit"
          disabled={pending}
          className="btn w-full bg-accent py-3 text-base text-on-accent disabled:opacity-60"
        >
          {pending ? "Signing…" : "Agree and sign"}
        </button>

        <p className="hint text-center text-xs">
          Signing records your name, the date, and the address you signed from, against this
          exact wording. Second Pair Ltd, registered in England and Wales, number 17453965.
        </p>
      </form>
    </div>
  );
}
