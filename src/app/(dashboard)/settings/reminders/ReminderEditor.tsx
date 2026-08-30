"use client";

import { useActionState } from "react";
import { saveReminder } from "./actions";
import { Field, FormMessage, SubmitButton } from "@/components/Form";
import type { FormState } from "../actions";

export type ReminderTemplateRow = {
  id: string;
  label: string;
  hours_before: number;
  body: string;
  enabled: boolean;
  sort_order: number;
};

/** Substitutions the owner can use, explained where they are typed. */
const TOKENS = [
  ["{{name}}", "their first name"],
  ["{{when}}", "the day and time"],
  ["{{practitioner}}", "who it is with"],
  ["{{business}}", "your name"],
];

export function ReminderEditor({
  reminder,
  index,
}: {
  reminder?: ReminderTemplateRow;
  index: number;
}) {
  const [state, action] = useActionState<FormState, FormData>(saveReminder, {});

  return (
    <form action={action} className="card space-y-4 p-5">
      {reminder && <input type="hidden" name="id" value={reminder.id} />}
      <input type="hidden" name="sort_order" value={reminder?.sort_order ?? index} />

      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <Field label="Name it">
          <input
            name="label"
            defaultValue={reminder?.label ?? ""}
            placeholder="The day before"
            className="input"
          />
        </Field>
        <Field label="Hours before">
          <input
            type="number"
            name="hours_before"
            min={1}
            max={720}
            defaultValue={reminder?.hours_before ?? 24}
            className="input w-32"
            required
          />
        </Field>
      </div>

      <Field label="What it says">
        <textarea
          name="body"
          defaultValue={reminder?.body ?? ""}
          rows={4}
          className="input"
          placeholder="See you tomorrow, {{name}} — {{when}} with {{practitioner}}."
          required
        />
        <p className="hint mt-2">
          {TOKENS.map(([token, means], i) => (
            <span key={token}>
              {i > 0 && " · "}
              <code className="rounded bg-surface-2 px-1 py-0.5">{token}</code> {means}
            </span>
          ))}
        </p>
      </Field>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="enabled"
          defaultChecked={reminder?.enabled ?? true}
          className="accent-[var(--accent)]"
        />
        Send this one
      </label>

      <div className="flex items-center gap-4">
        <SubmitButton className="btn-ghost">{reminder ? "Save" : "Add reminder"}</SubmitButton>
        <FormMessage state={state} />
        <div className="flex-1" />
        {reminder && (
          <button
            type="submit"
            name="intent"
            value="delete"
            formNoValidate
            className="btn-danger"
          >
            Remove
          </button>
        )}
      </div>
    </form>
  );
}
