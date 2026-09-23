"use client";

import { useActionState } from "react";
import { saveQuickMessage } from "../actions";
import { FormMessage, SubmitButton } from "@/components/Form";
import { REMINDER_PLACEHOLDERS } from "@/lib/reminderText";

/**
 * The wordings a business picks from on a client's page.
 *
 * Giles: "would be good to be able to send emails/messages to the clients in
 * the client page record a copy and have templates etc."
 *
 * One row per wording, each its own form, because a single form holding six
 * templates saves all six on every press — so correcting a typo in one
 * rewrites the other five with whatever happened to be in their boxes, and a
 * failure anywhere loses the lot.
 */
export function QuickMessages({
  templates,
}: {
  templates: { id: string; label: string; body: string }[];
}) {
  return (
    <div className="space-y-5">
      {templates.map((t, i) => (
        <One key={t.id} template={t} order={i} />
      ))}

      {/* A blank one, always last, so adding needs no button to find first. */}
      <One template={null} order={templates.length} />

      {templates.length === 0 && <Starters />}
    </div>
  );
}

function One({
  template,
  order,
}: {
  template: { id: string; label: string; body: string } | null;
  order: number;
}) {
  const [state, action] = useActionState<{ error?: string; ok?: boolean }, FormData>(
    saveQuickMessage,
    {},
  );

  return (
    <form action={action} className="card space-y-3 p-5">
      {template && <input type="hidden" name="id" value={template.id} />}
      <input type="hidden" name="sort_order" value={order} />

      <label className="block">
        <span className="label">Name it</span>
        <input
          name="label"
          defaultValue={template?.label ?? ""}
          placeholder="Running late"
          className="input max-w-sm"
          maxLength={24}
        />
        <span className="hint">
          What you will see on the button. Short enough to read at a glance.
        </span>
      </label>

      <label className="block">
        <span className="label">What it says</span>
        <textarea
          name="body"
          defaultValue={template?.body ?? ""}
          rows={3}
          placeholder="Hi {{name}}, so sorry — we're running about fifteen minutes behind today."
          className="input"
        />
        <span className="hint">
          {/*
            * Named rather than described, because somebody typing {{firstname}}
            * gets a sentence with a hole in it and no error anywhere.
            */}
          You can use {REMINDER_PLACEHOLDERS.map((p) => `{{${p}}}`).join(", ")}. Anything
          else is left out. It is filled in for whoever you are writing to, and you can
          change every word of it before it goes.
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-4">
        <SubmitButton className={template ? "btn-ghost" : "btn-highlight"} pending="Saving…">
          {template ? "Save" : "Add it"}
        </SubmitButton>

        {template && (
          <button
            type="submit"
            name="intent"
            value="delete"
            className="btn-ghost text-sm text-muted"
          >
            Remove
          </button>
        )}

        <FormMessage state={state} />
      </div>
    </form>
  );
}

/**
 * Six to start from, for a business with none.
 *
 * Offered rather than seeded on sign-up: wordings appearing in somebody's
 * settings unasked are things to read and delete. Pressed once, they become
 * ordinary rows to edit or throw away.
 */
function Starters() {
  const [state, action] = useActionState<{ error?: string; ok?: boolean }, FormData>(
    saveQuickMessage,
    {},
  );

  return (
    <form action={action} className="rounded-xl border border-border bg-surface-2/50 p-5">
      <input type="hidden" name="intent" value="starters" />
      <div className="label">Nothing saved yet</div>
      <p className="hint mt-1 max-w-prose">
        Start with six of the messages most businesses send — running late, a slot has come
        up, sorry we missed you. They arrive as ordinary rows, so rewrite them in your own
        words or throw away the ones you would never send.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <SubmitButton className="btn-ghost" pending="Adding…">
          Give me the six
        </SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
