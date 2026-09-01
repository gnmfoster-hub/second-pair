"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/Logo";

/**
 * Sign in, or create an account.
 *
 * Password rather than a magic link. Two reasons, and the second decided it:
 * a link gives no sense of creating an account at all — you type an email and
 * something arrives, with no sign-up step anywhere. And on a phone, which is
 * where most of these owners will be, the link opens in whichever browser
 * handles mail rather than the one they started in, so the session lands
 * somewhere they are not.
 *
 * Forgetting the password sends a real reset — a link that lets them choose a
 * new one — rather than a link that signs them in and leaves the old password
 * still wrong. On a phone that link opens in whichever browser handles mail,
 * which is fine here: setting a password is a page you visit once, not a
 * session you need in the browser you started in.
 */
type Mode = "signup" | "signin" | "forgot";

const FRIENDLY: Record<string, string> = {
  "Invalid login credentials": "That email and password do not match an account.",
  "User already registered":
    "There is already an account on that email. Sign in instead, or get a link.",
  "Password should be at least 6 characters": "Use at least eight characters.",
};

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState<"reset" | "confirm" | null>(null);

  const say = (message: string) => FRIENDLY[message] ?? message;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mode !== "forgot" && password.length < 8) {
      setError("Use at least eight characters.");
      return;
    }

    setBusy(true);
    setError("");
    const supabase = createClient();
    const redirect = `${window.location.origin}/auth/callback`;

    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: redirect, data: { full_name: name || null } },
      });
      if (error) setError(say(error.message));
      // With email confirmation on there is a user but no session yet.
      else if (!data.session) setSent("confirm");
      else {
        router.refresh();
        router.push("/");
      }
    } else if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(say(error.message));
      else {
        router.refresh();
        router.push("/");
      }
    } else {
      /*
       * A real reset, not a link that signs them in.
       *
       * The old behaviour sent a magic link: they got back in, but the password
       * they had forgotten was still the password, so the next visit failed the
       * same way. This sends them somewhere they can choose a new one.
       */
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
      });
      if (error) setError(say(error.message));
      else setSent("reset");
    }

    setBusy(false);
  }

  if (sent) {
    return (
      <Shell>
        <div className="card mt-7 p-5">
          <div className="section-title">Check your email</div>
          <p className="hint mt-2">
            {sent === "confirm" ? (
              <>
                We have sent <span className="text-foreground">{email}</span> a link to
                confirm the account. Open it and you are in.
              </>
            ) : (
              <>
                We have sent <span className="text-foreground">{email}</span> a link to
                choose a new password. It works once, and lasts an hour.
              </>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setSent(null);
            setMode("signin");
          }}
          className="hint mt-4 underline underline-offset-2 hover:text-foreground"
        >
          Back to sign in
        </button>
      </Shell>
    );
  }

  return (
    <Shell>
      {/* Two tabs, so it is obvious that an account is a thing you make. */}
      <div className="mt-7 flex gap-1 rounded-lg bg-surface-2 p-1">
        {(["signin", "signup"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setError("");
            }}
            aria-pressed={mode === m}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              mode === m
                ? "bg-surface text-foreground shadow-[var(--shadow-card)]"
                : "text-muted hover:text-foreground"
            }`}
          >
            {m === "signin" ? "Sign in" : "Create account"}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="mt-5 space-y-3.5">
        {mode === "signup" && (
          <div>
            <label className="label" htmlFor="name">
              Your name
            </label>
            <input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Dave Foster"
              className="input"
              autoComplete="name"
            />
          </div>
        )}

        <div>
          <label className="label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            inputMode="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@yourbusiness.co.uk"
            className="input"
            autoComplete="email"
          />
        </div>

        {mode !== "forgot" && (
          <div>
            <label className="label" htmlFor="password">
              Password
            </label>
            {/*
              * Showing it is worth more here than hiding it.
              *
              * Almost everybody signs in alone on their own phone, where the
              * risk is a typo in a field you cannot read rather than somebody
              * behind you — and a mistyped password on signup is a failure you
              * only discover on the next visit. It starts hidden, because that
              * is what people expect, and the choice is theirs.
              */}
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="input pr-12"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                minLength={8}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                // Not in the tab order: somebody tabbing through the form wants
                // the next field, not a button that changes nothing they typed.
                tabIndex={-1}
                className="absolute right-1 top-1/2 grid h-9 w-10 -translate-y-1/2 place-items-center rounded-lg text-muted transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {showPassword ? (
                  // Struck through: the state it would go to, not the state it is in.
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
        )}

        {error && (
          <p className="rounded-lg bg-warn/10 px-3 py-2 text-sm text-warn" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy
            ? "One moment…"
            : mode === "signup"
              ? "Create account"
              : mode === "signin"
                ? "Sign in"
                : "Send me a reset link"}
        </button>
      </form>

      {mode === "signin" && (
        <button
          type="button"
          onClick={() => {
            setMode("forgot");
            setError("");
          }}
          className="hint mt-4 underline underline-offset-2 hover:text-foreground"
        >
          Forgotten your password?
        </button>
      )}

      {mode === "signup" && (
        <p className="hint mt-4">
          Next you name your business and pick your trade. About a minute.
        </p>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm">
        <Logo height={56} lockup="flush-right" />
        <p className="hint mt-3">
          Answers your enquiries, quotes from your prices, and books people in — while
          your hands are full.
        </p>
        {children}
      </div>
    </div>
  );
}
