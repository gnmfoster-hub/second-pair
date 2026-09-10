"use client";

import { useActionState } from "react";
import { removeConversation, type RemoveState } from "./actions";

/**
 * Throwing a thread away.
 *
 * Folded, at the bottom, and behind a confirmation — it cannot be undone, and
 * a misclick in an inbox is exactly how the wrong conversation goes. But it is
 * findable, and named for what it does, because the alternative is what was
 * here before: no way at all to remove spam, a wrong number, or your own
 * testing from your own inbox.
 */
export function Remove({ id, who }: { id: string; who: string | null }) {
  const [state, action] = useActionState<RemoveState, FormData>(removeConversation, {});
  const called = who?.trim() || "this person";

  return (
    <details className="mt-8 rounded-xl border border-border p-3.5">
      <summary className="cursor-pointer text-sm text-muted">
        Delete this conversation
      </summary>

      <form action={action} className="mt-3 space-y-3">
        <input type="hidden" name="id" value={id} />

        <p className="hint max-w-prose">
          Removes the whole thread and every message in it, for good. For spam, a wrong
          number, or something you sent yourself while testing.
        </p>
        <p className="hint max-w-prose">
          {/*
            * The distinction between the two destructive things in the product,
            * said where somebody is about to pick one. They sound alike and do
            * opposite things to the diary.
            */}
          If {called} has asked you to delete <em>them</em>, use{" "}
          <strong className="text-foreground">If they ask about their data</strong> on
          their client page instead &mdash; that keeps their appointments in your diary
          without their name on them, so your week still adds up.
        </p>

        {state.error && (
          <p className="rounded-lg bg-warn/10 px-3 py-2 text-sm text-warn">{state.error}</p>
        )}

        <button type="submit" className="btn-ghost text-warn">
          Delete this conversation
        </button>
      </form>
    </details>
  );
}
