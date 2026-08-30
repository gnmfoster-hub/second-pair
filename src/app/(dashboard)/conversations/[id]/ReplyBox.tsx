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
        <p className="hint ml-auto">Sending pauses the assistant on this conversation.</p>
      </div>
    </form>
  );
}
