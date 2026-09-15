"use client";

import { useActionState, useState } from "react";
import { sendLinkNow, type PayLinkState } from "../payLinkActions";
import type { Channel } from "@/lib/types";

/**
 * Where the link goes once it exists.
 *
 * Completing an appointment by link used to end on the link itself, printed on
 * the screen — which is right for somebody stood at the desk with their phone
 * out and wrong for everybody else, who expected it to reach the client. Now
 * the ways that would actually reach them are buttons that say where: a text
 * to their number, an email to their address. Copying it is still there for
 * the client stood in front of you.
 */
export function SendLink({
  url,
  paymentId,
  sendTo,
}: {
  url: string;
  paymentId: string;
  sendTo: { channel: Channel; label: string; to: string }[];
}) {
  const [state, action, pending] = useActionState<PayLinkState, FormData>(sendLinkNow, {});
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const sentTo = state.sentOn ? sendTo.find((r) => r.channel === state.sentOn) : null;

  return (
    <div className="mt-3 space-y-2">
      {sentTo ? (
        <p className="rounded-lg bg-ok/10 px-3 py-2 text-sm text-ok">
          Sent{sentTo.to ? ` to ${sentTo.to}` : ""}. It marks itself paid when they pay.
        </p>
      ) : (
        <form action={action} className="space-y-2">
          <input type="hidden" name="url" value={url} />
          <input type="hidden" name="payment_id" value={paymentId} />
          {sendTo.map((r) => (
            <button
              key={r.channel}
              name="send_on"
              value={r.channel}
              disabled={pending}
              className="btn w-full bg-accent py-2.5 text-on-accent disabled:opacity-60"
            >
              {r.label} it{r.to ? ` to ${r.to}` : ""}
            </button>
          ))}
          {sendTo.length === 0 && (
            <p className="hint text-sm">
              There is no number or email on their record to send it to. Copy it, or show
              them the link.
            </p>
          )}
        </form>
      )}

      {state.error && <p className="text-sm text-warn">{state.error}</p>}

      <button type="button" onClick={copy} className="btn w-full border border-border">
        {copied ? "Copied" : "Copy the link"}
      </button>
      <a href={url} target="_blank" rel="noreferrer" className="block text-center text-sm text-accent hover:underline">
        Open it here, for them to pay now
      </a>
    </div>
  );
}
