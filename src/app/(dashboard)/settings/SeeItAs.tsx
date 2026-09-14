"use client";

import { useActionState } from "react";
import { openDemo, type Result } from "@/app/admin/actions";

/**
 * Looking at the demo from somebody else's side, without leaving it.
 *
 * The back office can do this, and going there mid-demonstration means showing
 * a customer the screen where every other business on the platform is listed —
 * which is the one screen they must never see. So the same thing lives here,
 * on the demo's own settings, one tab from wherever the conversation is.
 *
 * Only on a demo, and only for somebody who runs the platform. Both are
 * checked again inside the action rather than trusted from here: this hands
 * over a signed-in session, and a control being hidden is not a permission.
 */
export function SeeItAs({
  studioId,
  views,
}: {
  studioId: string;
  views: { userId: string; label: string; what: string }[];
}) {
  const [state, action] = useActionState<Result, FormData>(openDemo, {});

  if (views.length === 0) return null;

  return (
    <section className="card p-5">
      <form action={action}>
        <input type="hidden" name="id" value={studioId} />

        <h2 className="section-title">See it as somebody else</h2>
        <p className="hint mt-1 max-w-prose">
          What a salon asks second, straight after &ldquo;can they change my prices?&rdquo;.
          Each one opens a link that signs you in as them and is spent once it is used, so
          open it in a private window if you want to keep your own session.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {views.map((v) => (
            <button
              key={v.userId}
              name="as"
              value={v.userId}
              className="rounded-xl border border-border bg-surface-2/40 px-3 py-2 text-left transition-colors hover:border-accent/50"
            >
              <span className="block text-sm font-medium">{v.label}</span>
              <span className="hint">{v.what}</span>
            </button>
          ))}
        </div>

        {state.link && (
          <a
            href={state.link}
            className="mt-3 block break-all rounded-lg bg-surface-2 px-3 py-2 text-sm text-accent underline"
          >
            {state.note ?? "Open"}
          </a>
        )}
        {state.error && <p className="mt-2 text-sm text-warn">{state.error}</p>}
      </form>
    </section>
  );
}
