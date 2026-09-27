"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Changing your password while you are signed in.
 *
 * Giles: "can we impliment a change password/forgot password function for
 * users."
 *
 * Forgetting one already worked end to end — the sign-in page has a "forgot"
 * mode, it sends a real reset rather than a link that signs you in and leaves
 * the old password still wrong, and /reset-password is where a new one gets
 * chosen. That half needed nothing.
 *
 * This is the half that did not exist. Somebody already signed in, who simply
 * wants to change their password, had to sign out and pretend to have
 * forgotten it — which means waiting for an email to do a thing they could
 * have done in ten seconds, and which most people will not bother with. A
 * password nobody can change is a password nobody changes.
 *
 * ── The current one is asked for, and it is not a formality ─────────────────
 *
 * Supabase will change a password from a live session without it. That is
 * exactly the problem: a salon iPad left signed in on the counter, or a phone
 * somebody picks up, is enough for a stranger to take the account — change the
 * password and the owner is locked out of their own diary.
 *
 * So it is checked first, by signing in with it. That call is the only honest
 * way to know it is right, and it costs a second.
 */
export function ChangePassword({ email }: { email: string | null }) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (next.length < 8) {
      setError("Use at least eight characters.");
      return;
    }
    if (next === current) {
      setError("That is the password you already have.");
      return;
    }
    if (!email) {
      setError("We do not have your email address, so this cannot be checked.");
      return;
    }

    setBusy(true);
    const supabase = createClient();

    /*
     * Proved, not assumed.
     *
     * Signing in with the current password is the only way to know somebody
     * typed the right one. It replaces the session with an identical one for
     * the same user, so nothing is lost when it succeeds — and when it fails,
     * nothing has been changed.
     */
    const { error: wrong } = await supabase.auth.signInWithPassword({
      email,
      password: current,
    });

    if (wrong) {
      setBusy(false);
      setError("That is not your current password.");
      return;
    }

    const { error: failed } = await supabase.auth.updateUser({ password: next });
    setBusy(false);

    if (failed) {
      /*
       * Said in our words where we know what it means. Supabase's own wording
       * is written for whoever built the app, not for whoever is using it.
       */
      setError(
        /at least/i.test(failed.message)
          ? "Use at least eight characters."
          : /same.*password|different/i.test(failed.message)
            ? "That is the password you already have."
            : "It did not save. Try again in a moment.",
      );
      return;
    }

    setCurrent("");
    setNext("");
    setDone(true);
    setOpen(false);
  }

  return (
    <section className="card p-5">
      <h2 className="section-title">Your password</h2>

      {done && !open ? (
        <p className="mt-1.5 text-sm text-ok">
          Changed. You are still signed in here; anywhere else you are signed in stays
          signed in too.
        </p>
      ) : (
        <p className="hint mt-1.5 max-w-prose">
          Change it whenever you like. If you have forgotten it, sign out and use
          &ldquo;I have forgotten my password&rdquo; on the sign-in page instead.
        </p>
      )}

      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="btn-ghost mt-3">
          {done ? "Change it again" : "Change your password"}
        </button>
      ) : (
        <form onSubmit={submit} className="mt-4 max-w-sm space-y-3">
          {/*
            * Here so a password manager knows whose password this is. Hidden
            * from sight and from a screen reader, because it is not something
            * anybody is being asked to fill in.
            */}
          <input type="text" name="username" autoComplete="username" value={email ?? ""} readOnly hidden aria-hidden />

          <label className="block text-sm">
            <span className="label">Your current password</span>
            <input
              type={show ? "text" : "password"}
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              className="input"
              required
              autoFocus
            />
          </label>

          <label className="block text-sm">
            <span className="label">Your new password</span>
            <input
              type={show ? "text" : "password"}
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              className="input"
              required
            />
            <span className="hint">At least eight characters.</span>
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={show}
              onChange={() => setShow((s) => !s)}
              className="accent-[var(--accent)]"
            />
            Show what I am typing
          </label>

          {error && <p className="text-sm text-bad">{error}</p>}

          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className="btn bg-accent text-on-accent" disabled={busy}>
              {busy ? "Changing…" : "Change it"}
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                setOpen(false);
                setError("");
                setCurrent("");
                setNext("");
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
