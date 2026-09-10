"use client";

import { useActionState } from "react";
import { disconnectMeta, type FormState } from "../actions";

/**
 * Connecting a business's own Facebook Page and Instagram.
 *
 * The whole point of the arrangement is that this is theirs: they press the
 * button, log in as themselves on Facebook, and agree. Nobody at Second Pair
 * sees their password, and they can take it back from their own Facebook
 * settings without asking us. That is worth saying on the screen, because it
 * is the question anybody sensible asks before pressing a button that says
 * "connect my Instagram".
 */

export type MetaConnection = {
  id: string;
  channel: string;
  label: string | null;
};

const NAMES: Record<string, string> = {
  messenger: "Facebook Messenger",
  instagram: "Instagram DMs",
};

/** What came back on the query string, said in words rather than in codes. */
const OUTCOMES: Record<string, { tone: "ok" | "warn"; text: string }> = {
  connected: { tone: "ok", text: "Connected. Messages will arrive in your inbox." },
  cancelled: {
    tone: "warn",
    text: "Nothing was connected — you cancelled on Facebook. No harm done.",
  },
  "owner-only": {
    tone: "warn",
    text: "Only the owner can connect an account, because it decides who may message your customers.",
  },
  expired: {
    tone: "warn",
    text: "That took too long, or the link was tampered with. Press connect again.",
  },
  "no-pages": {
    tone: "warn",
    text: "Facebook did not offer a Page. You need a Facebook Page, and an Instagram Professional account linked to it.",
  },
  "no-code": { tone: "warn", text: "Facebook sent us back without an answer. Try again." },
  "exchange-failed": {
    tone: "warn",
    text: "Facebook accepted you but would not finish. Try again, and tell us if it happens twice.",
  },
  "not-configured": {
    tone: "warn",
    text: "Not switched on yet at our end. This one is on Second Pair, not on you.",
  },
};

export function MetaChannels({
  connections,
  outcome,
  isOwner,
}: {
  connections: MetaConnection[];
  /** The ?meta= value, when they have just come back from Facebook. */
  outcome?: string;
  isOwner: boolean;
}) {
  const said = outcome ? OUTCOMES[outcome] : null;

  return (
    <div className="card p-5">
      <div className="section-title">Facebook and Instagram</div>
      <p className="hint mt-1 max-w-prose">
        Your accounts, not ours. You log in to Facebook yourself and choose what to
        share &mdash; we never see your password, and you can disconnect from your own
        Facebook settings at any time without telling us.
      </p>

      {said && (
        <p
          className={`mt-4 rounded-lg px-3 py-2 text-sm ${
            said.tone === "ok" ? "bg-ok/10 text-ok" : "bg-warn/10 text-warn"
          }`}
        >
          {said.text}
        </p>
      )}

      {connections.length > 0 && (
        <ul className="mt-4 divide-y divide-border rounded-xl border border-border">
          {connections.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-3 p-3.5">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{NAMES[c.channel] ?? c.channel}</div>
                <div className="hint truncate">{c.label ?? "Connected"}</div>
              </div>
              <span className="pill shrink-0 bg-ok/10 text-ok">Connected</span>
              {isOwner && <Disconnect id={c.id} />}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {/*
          * A link rather than a button with a handler.
          *
          * This leaves our site entirely — it is a full navigation to
          * Facebook — and dressing that up as an in-page action would be
          * hiding where somebody is about to go with their password.
          */}
        <a
          href="/api/meta/connect/start"
          className={`btn inline-flex ${
            isOwner
              ? "bg-accent text-on-accent"
              : "pointer-events-none opacity-50"
          }`}
          aria-disabled={!isOwner}
        >
          {connections.length ? "Connect another" : "Connect Facebook and Instagram"}
        </a>
        <span className="hint">
          {isOwner
            ? "Takes you to Facebook to log in and agree."
            : "Only the owner can connect an account."}
        </span>
      </div>

      <p className="hint mt-4 max-w-prose">
        <strong className="text-foreground">Before you press it:</strong> your Instagram
        needs to be a <strong className="text-foreground">Professional account</strong>{" "}
        linked to a Facebook Page. That is a free change in the Instagram app, under
        Settings, and most trades have already done it.
      </p>
    </div>
  );
}

function Disconnect({ id }: { id: string }) {
  const [state, action] = useActionState<FormState, FormData>(disconnectMeta, {});

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="btn-ghost text-sm">
        Disconnect
      </button>
      {state.error && <span className="text-xs text-warn">{state.error}</span>}
    </form>
  );
}
