"use client";

import { useActionState } from "react";
import { forgetClient, type ForgetState } from "../actions";

/**
 * Erasing somebody at their own request.
 *
 * A person can ask a business to delete them, and the business has to be able
 * to do it. Until now there was no way at all — a salon receiving that request
 * had nothing to offer but an apology.
 *
 * Folded away and written plainly, because it is rare, permanent, and the
 * consequence is easy to underestimate from a list of names. Their name typed
 * out is the confirmation: a misclick in a list is exactly how the wrong
 * person gets erased.
 */
export function Forget({ id, name }: { id: string; name: string | null }) {
  /*
   * A client added from a diary entry may have no name yet. "Erase" with a
   * blank after it is not a thing anybody should be asked to confirm, so they
   * get a description instead — and the server still checks what was typed.
   */
  const called = name?.trim() || "this client";
  const [state, action] = useActionState<ForgetState, FormData>(forgetClient, {});

  return (
    <details className="mt-8 rounded-xl border border-border p-3.5">
      <summary className="cursor-pointer text-sm text-muted">
        If {called} asks about their data
      </summary>

      {/*
        * The copy comes first, and deliberately.
        *
        * Both of these answer a request from the same person, and one is
        * reversible while the other is not. Somebody who asks "what do you
        * have on me" wants this one — putting erasure first would put the
        * permanent action under the thumb of somebody reaching for the other.
        */}
      <div className="mt-3 border-b border-border pb-4">
        <p className="hint max-w-prose">
          Anybody can ask what a business holds about them, and you have a month to
          send it. This is that, written as something they can read.
        </p>
        <a href={`/clients/${id}/copy`} className="btn-ghost mt-3 inline-flex">
          Download everything about {called}
        </a>
      </div>

      <form action={action} className="mt-3 space-y-3">
        <input type="hidden" name="id" value={id} />

        <p className="hint max-w-prose">
          Removes {called} and every message they ever sent you, for good. Their
          appointments stay in your diary without their name on them, so your week still
          adds up &mdash; what goes is who they were, not that the afternoon happened.
        </p>
        <p className="hint max-w-prose">
          This is what to use if somebody asks you to delete them. It cannot be undone.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <input
            name="confirm"
            className="input max-w-xs"
            placeholder={`Type ${called} to confirm`}
            aria-label={`Type ${called} to confirm`}
            autoComplete="off"
          />
          <button type="submit" className="btn bg-warn text-white">
            Erase them
          </button>
          {state.error && <span className="text-sm text-warn">{state.error}</span>}
        </div>
      </form>
    </details>
  );
}
