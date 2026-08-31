"use client";

import { useState, useTransition } from "react";
import { inviteToTeam, withdrawInvite } from "../actions";

/**
 * Giving somebody their own login.
 *
 * Deliberately optional and deliberately second. Plenty of people in these
 * businesses will never sign in — the owner adds them, manages their diary,
 * and that has to keep working. An invite is an extra, offered once they
 * exist, not a step in creating them.
 *
 * The link is the credential, so it is shown once and copied. Emailing it
 * would need an email provider this does not have yet, and a link the owner
 * hands over in person or on WhatsApp is no less secure.
 */
export function InviteButton({
  artistId,
  name,
  hasLogin,
  pendingToken,
  origin,
}: {
  artistId: string;
  name: string;
  /** They have already accepted; there is nothing to invite. */
  hasLogin: boolean;
  /** An invite already sent and not yet used. */
  pendingToken: string | null;
  origin: string;
}) {
  const [token, setToken] = useState(pendingToken);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  /** Set when we managed to email it for them, so they need not send it. */
  const [emailedTo, setEmailedTo] = useState("");
  const [emailError, setEmailError] = useState("");
  const [busy, run] = useTransition();

  if (hasLogin) {
    return (
      <span className="pill bg-ok/10 text-ok" title={`${name} can sign in`}>
        Has a login
      </span>
    );
  }

  const link = token ? `${origin}/join/${token}` : null;

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard refused; the link is on screen to select by hand.
    }
  };

  if (link) {
    return (
      <div className="w-full rounded-xl border border-border bg-surface-2/50 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-medium">
            {emailedTo
              ? `Emailed to ${emailedTo}. It works once, and expires in 14 days`
              : `Send this to ${name.split(" ")[0]} — it works once, and expires in 14 days`}
          </span>
          <button
            type="button"
            onClick={() =>
              run(async () => {
                await withdrawInvite(artistId);
                setToken(null);
              })
            }
            className="text-xs text-muted hover:text-bad"
          >
            Withdraw
          </button>
        </div>

        {/* It did not send, so the link below is the only way. Said plainly,
            because an owner who assumes it went will wait for nothing. */}
        {emailError && (
          <p className="mt-2 rounded-lg bg-warn/10 px-3 py-2 text-xs leading-relaxed text-warn">
            It could not be emailed: {emailError} Send them the link instead.
          </p>
        )}

        <div className="mt-2 flex items-stretch gap-2">
          <code className="min-w-0 flex-1 overflow-x-auto rounded-lg border border-border bg-surface px-3 py-2 font-mono text-[11px] leading-relaxed">
            {link}
          </code>
          <button type="button" onClick={copy} className="btn-ghost shrink-0 px-3 text-xs">
            {copied ? <span className="text-ok">Copied</span> : "Copy"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        disabled={busy}
        onClick={() =>
          run(async () => {
            setError("");
            const result = await inviteToTeam(artistId);
            if (result.error) {
              setError(result.error);
              return;
            }
            setToken(result.token ?? null);
            setEmailedTo(result.emailedTo ?? "");
            setEmailError(result.emailError ?? "");
          })
        }
        className="btn-ghost py-1.5 text-xs"
      >
        {busy ? "One moment…" : "Give them a login"}
      </button>
      {error && <p className="mt-1 text-xs text-bad">{error}</p>}
    </div>
  );
}
