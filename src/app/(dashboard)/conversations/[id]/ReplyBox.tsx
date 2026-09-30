"use client";

import { useActionState, useState } from "react";
import { sendOwnerReply, type ReplyState } from "./actions";
import { FormMessage, SubmitButton } from "@/components/Form";
import { worthChoosing, type ReplyWay } from "@/lib/messaging/waysToReply";

export function ReplyBox({
  conversationId,
  /** Every way this person could actually be answered. See lib/messaging/waysToReply. */
  ways,
}: {
  conversationId: string;
  ways: ReplyWay[];
}) {
  const [state, action] = useActionState<ReplyState, FormData>(sendOwnerReply, {});

  /*
   * The first way is what the product would have done on its own, so starting
   * there means adding this choice changes nothing for anybody who ignores it.
   */
  const [via, setVia] = useState(ways[0]?.id ?? "chat");
  const chosen = ways.find((w) => w.id === via) ?? ways[0];

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="conversation_id" value={conversationId} />
      <input type="hidden" name="via" value={via} />
      <textarea
        name="message"
        rows={3}
        className="input"
        placeholder="Reply as the business…"
        required
      />
      {/*
        * How it goes, above the button that sends it.
        *
        * Only where there is more than one way: a row of one button that cannot
        * be changed is furniture, and on most conversations there is exactly one
        * honest answer.
        *
        * Where it goes is printed beside the choice, because the number or the
        * address is the thing worth checking before pressing send - the assistant
        * collected it from somebody typing on a phone, and a mistyped digit lands
        * on a stranger.
        */}
      {worthChoosing(ways) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="label">Send it by</span>
          <div className="flex flex-wrap gap-1.5">
            {ways.map((way) => (
              <label
                key={way.id}
                className={`cursor-pointer rounded-lg border px-2.5 py-1 text-sm transition-colors ${
                  via === way.id
                    ? "border-accent bg-accent/10 text-foreground"
                    : "border-border text-muted hover:border-accent/40"
                }`}
              >
                <input
                  type="radio"
                  name="via_choice"
                  value={way.id}
                  checked={via === way.id}
                  onChange={() => setVia(way.id)}
                  className="sr-only"
                />
                {way.label}
              </label>
            ))}
          </div>
          {chosen?.to && <span className="hint font-mono text-xs">{chosen.to}</span>}
        </div>
      )}

      {chosen?.note && <p className="hint max-w-prose text-xs">{chosen.note}</p>}

      <div className="flex items-center gap-4">
        {/* Two words that must stay two words: a button broken across lines
            reads as a button that is broken. */}
        <SubmitButton className="btn-highlight whitespace-nowrap" pending="Sending…">
          Send reply
        </SubmitButton>
        <FormMessage state={state} />
        {/*
         * Saved, but it did not reach them.
         *
         * Silence here would be the worst outcome: the owner sees their reply
         * in the thread, assumes it went, and finds out days later that the
         * customer never heard from anybody.
         */}
        {state.warning && (
          <p className="mt-2 rounded-lg bg-warn/10 px-3 py-2 text-xs leading-relaxed text-warn">
            {state.warning}
          </p>
        )}
        <p className="hint ml-auto">Sending pauses the assistant on this conversation.</p>
      </div>
    </form>
  );
}
