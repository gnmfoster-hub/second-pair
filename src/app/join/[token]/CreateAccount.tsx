"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
  const [state, action] = useActionState<JoinState, FormData>(joinWithNewAccount, {});
  const [email, setEmail] = useState(invitedEmail ?? "");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState("");

  /*
   * The account is made by the server, then signed in here.
   *
   * A session can only be established in the browser that will hold it, so the
   * two halves are split — the server decides whether they may have an
   * account, this half picks up the session it just made possible.
   */
  async function afterCreated() {
    setBusy(true);
    const { error } = await createClient().auth.signInWithPassword({ email, password });
    if (error) {
      setFailed("Your account is made — sign in and open the link again.");
      setBusy(false);
      return;
    }
    router.refresh();
    // Back to the invitation, which now finds somebody signed in and accepts it.
    router.push(window.location.pathname);
  }

  if (state.ok && !failed) {
    void afterCreated();
    return <p className="hint mt-4">Setting your account up…</p>;
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

      <button type="submit" disabled={busy} className="btn w-full bg-accent text-on-accent">
        {busy ? "One moment…" : "Create my account"}
      </button>

      {(state.error || failed) && (
        <p className="text-sm text-warn">{state.error || failed}</p>
      )}
    </form>
  );
}
