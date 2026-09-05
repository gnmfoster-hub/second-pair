"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { joinWithNewAccount, type JoinState } from "./actions";

/**
 * Choosing a password, for somebody who was invited and has no account.
 *
 * The page used to tell them to "sign in or create an account" and there was
 * nowhere to create one, so an invited stylist could not get in at all.
 *
 * Signed in immediately afterwards rather than sent back to the login page to
 * type what they have just chosen. They came here from a link in a message
 * with one thing to do, and finishing it should not involve being handed to a
 * different screen.
 */
export function CreateAccount({ token, invitedEmail }: { token: string; invitedEmail: string | null }) {
  const [state, action, pending] = useActionState<JoinState, FormData>(joinWithNewAccount, {});
  const [email, setEmail] = useState(invitedEmail ?? "");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const started = useRef(false);
  const [failed, setFailed] = useState("");

  /*
   * The account is made by the server, then signed in here.
   *
   * A session can only be established in the browser that will hold it, so the
   * two halves are split — the server decides whether they may have an
   * account, this half picks up the session it just made possible.
   */
  /*
   * Signed in once the server says the account exists.
   *
   * In an effect, not during render: this used to be called while rendering,
   * so React was free to run it twice and a second sign-in would race the
   * first.
   */
  useEffect(() => {
    if (!state.ok || failed || started.current) return;

    /*
     * Guarded with a ref rather than state.
     *
     * Setting state at the top of an effect starts another render before this
     * one has finished, and the guard has to hold across that — a ref is the
     * thing that survives it without causing it.
     */
    started.current = true;
    let cancelled = false;

    (async () => {
      const { error } = await createClient().auth.signInWithPassword({ email, password });
      if (cancelled) return;

      if (error) {
        setFailed("Your account is made — sign in and open the link again.");
        started.current = false;
        return;
      }

      /*
       * A full page load, not a client navigation.
       *
       * It used to refresh and push to the same address, which Next treats as
       * going nowhere — so the page never re-rendered, the invitation was
       * never accepted, and somebody who had just chosen a password sat
       * looking at a blank screen until they refreshed it themselves.
       *
       * Reloading is the honest way to say "you are somebody else now": the
       * cookie is set, and the server renders the page again knowing who they
       * are, accepts the invitation, and sends them on.
       */
      window.location.assign(window.location.pathname);
    })();

    return () => {
      cancelled = true;
    };
    // Keyed on the server's answer alone; re-running on every keystroke would
    // try to sign in again mid-flight.
  }, [state.ok]); // eslint-disable-line react-hooks/exhaustive-deps

  if (state.ok && !failed) {

    return <p className="hint mt-4">Signing you in&hellip;</p>;
  }

  return (
    <form action={action} className="mt-5 space-y-4">
      <input type="hidden" name="token" value={token} />

      <label className="block">
        <span className="label">Your email</span>
        <input
          name="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          // Fixed when the invitation names somebody: a link meant for one
          // person should not make an account for another.
          readOnly={Boolean(invitedEmail)}
          className="input"
          autoComplete="username"
        />
      </label>

      <label className="block">
        <span className="label">Choose a password</span>
        <div className="relative mt-1">
          <input
            name="password"
            type={show ? "text" : "password"}
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input pr-16"
            autoComplete="new-password"
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted hover:text-foreground"
          >
            {show ? "Hide" : "Show"}
          </button>
        </div>
        <p className="hint mt-1">At least eight characters.</p>
      </label>

      {/* useActionState knows when the server is working; a second flag of our
          own would only be able to disagree with it. */}
      <button type="submit" disabled={pending} className="btn w-full bg-accent text-on-accent">
        {pending ? "One moment…" : "Create my account"}
      </button>

      {(state.error || failed) && (
        <p className="text-sm text-warn">{state.error || failed}</p>
      )}
    </form>
  );
}
