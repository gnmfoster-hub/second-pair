"use client";

import { useActionState } from "react";
import { sendOwnerReply, type ReplyState } from "./actions";
import { FormMessage, SubmitButton } from "@/components/Form";

export function ReplyBox({ conversationId }: { conversationId: string }) {
  const [state, action] = useActionState<ReplyState, FormData>(sendOwnerReply, {});

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="conversation_id" value={conversationId} />
      <textarea
        name="message"
        rows={3}
        className="input"
        placeholder="Reply as the business…"
        required
      />
      <div className="flex items-center gap-4">
        <SubmitButton>Send reply</SubmitButton>
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
