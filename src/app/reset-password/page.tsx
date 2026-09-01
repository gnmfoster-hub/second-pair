"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/Logo";

/**
 * Choosing a new password.
 *
 * Reached from the reset link, which has already been exchanged for a session
 * by /auth/callback — so by the time anybody is here they are signed in, and
 * the only thing left is to set the password they will use next time.
 *
 * The session is what authorises the change, which is why this page checks for
 * one before showing the form: a reset link that has expired, or been used
 * already, would otherwise present a form that cannot possibly work and fail
 * only on submit.
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState<boolean | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => setReady(Boolean(data.session)));
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (password.length < 8) {
      setError("At least 8 characters.");
      return;
    }

    setBusy(true);
    setError("");

    const supabase = createClient();
    const { error: failed } = await supabase.auth.updateUser({ password });

    if (failed) {
      setError(
        /same/i.test(failed.message)
          ? "That is the password you already have. Choose a different one."
          : failed.message,
      );
      setBusy(false);
      return;
    }

    // Straight in, rather than back to a sign-in form to type what they have
    // only just chosen.
    router.refresh();
    router.push("/");
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm">
        <Logo height={56} lockup="flush-right" />

        {ready === false ? (
          <div className="card mt-7 p-5">
            <div className="section-title">That link has expired</div>
            <p className="hint mt-2">
              Reset links work once and last an hour. Ask for another and it will be
              waiting in a moment.
            </p>
            <a href="/login" className="btn-primary mt-4 w-full">
              Back to sign in
            </a>
          </div>
        ) : (
          <form onSubmit={submit} className="card mt-7 space-y-5 p-5">
            <div>
              <div className="section-title">Choose a new password</div>
              <p className="hint mt-1">
                You are signed in already. This is the one you will use next time.
              </p>
            </div>

            <div>
              <label className="label" htmlFor="password">
                New password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={show ? "text" : "password"}
                  required
                  minLength={8}
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="input pr-12"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  aria-label={show ? "Hide password" : "Show password"}
                  aria-pressed={show}
                  tabIndex={-1}
                  className="absolute right-1 top-1/2 grid h-9 w-10 -translate-y-1/2 place-items-center rounded-lg text-muted transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  {show ? (
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M3 3l18 18" />
                      <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
                      <path d="M9.4 5.2A9.5 9.5 0 0 1 12 4.9c5 0 9 4.1 9 7.1a8.6 8.6 0 0 1-2.2 3.4" />
                      <path d="M6.3 6.9C4.2 8.3 3 10.4 3 12c0 3 4 7.1 9 7.1a9.8 9.8 0 0 0 3.6-.7" />
                    </svg>
                  ) : (
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M3 12s3.6-7.1 9-7.1 9 4.1 9 7.1-3.6 7.1-9 7.1S3 15 3 12Z" />
                      <circle cx="12" cy="12" r="2.6" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {error && <p className="text-sm text-bad">{error}</p>}

            <button type="submit" className="btn-primary w-full" disabled={busy || !ready}>
              {busy ? "One moment…" : "Save and carry on"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
