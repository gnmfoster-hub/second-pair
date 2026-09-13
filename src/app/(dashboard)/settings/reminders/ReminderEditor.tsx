"use client";

import { useActionState, useState } from "react";
import { saveReminder } from "./actions";
import { Field, FormMessage, SubmitButton } from "@/components/Form";
import type { FormState } from "../actions";
import { renderReminder, unknownPlaceholders } from "@/lib/reminderText";

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

/**
 * Who a reminder arrives from.
 *
 * The question every business asks about this and nothing in the product
 * answered: a text at half past eight from an unknown number, telling somebody
 * where to be tomorrow, is a text that gets ignored or reported. The answer is
 * good — it comes from their own number, the one on their van — and it was
 * never said anywhere.
 */
export type Sender = {
  /** The business's own number, in the shape a person reads it. Null if none. */
  number: string | null;
  /** What the business is called, for the line underneath. */
  business: string;
  /** Whether the platform can actually send yet. */
  ready: boolean;
};

/**
 * The message, as it will land.
 *
 * Reminders were written in a box and sent, and the first time anybody saw one
 * rendered was when a customer did. A template reads fine with its
 * placeholders in and turns out wrong once they are filled — a sentence that
 * meant "with Sarah" says "with us", two spaces appear where something was
 * stripped, or the typo in {{practitioner}} silently removes the whole point of
 * the message.
 *
 * Drawn as a phone rather than a box of text on purpose. The thing being
 * judged is whether this reads well arriving on somebody's lock screen at
 * eight in the morning, and that judgement is much easier to make when it
 * looks like the place it is going.
 */
function Preview({ body, sender }: { body: string; sender: Sender }) {
  /*
   * Filled with the same function that fills it for real, deliberately. A
   * preview that renders a template its own way is a preview that can be
   * wrong, and the whole point of this is to be trusted.
   */
  const text = renderReminder(body, {
    name: "Marie",
    practitioner: "Sarah",
    business: sender.business,
    when: "tomorrow at 2pm",
  });

  return (
    <div>
      <div className="label">How it lands</div>

      <div className="mt-1.5 max-w-sm rounded-2xl border border-border bg-surface-2/50 p-3">
        <div className="hint">
          {sender.number ? (
            <>
              From <span className="font-mono">{sender.number}</span>
            </>
          ) : (
            "From your number, once you have one"
          )}
        </div>

        <div className="mt-1.5 rounded-2xl rounded-bl-md bg-surface px-3.5 py-2.5 text-sm leading-relaxed shadow-sm">
          {text || <span className="text-muted">Nothing yet.</span>}
        </div>

        <div className="hint mt-1.5 text-right tabular-nums">
          {/*
            * Length, because it is money and nobody thinks about it while
            * typing. A text is billed per 160 characters, so a template that
            * runs to 161 costs twice as much for every customer, every
            * reminder, for as long as it is switched on.
            */}
          {text.length} characters
          {text.length > 160 && (
            <span className="text-warn">
              {" "}
              &mdash; over 160, so it is charged as {Math.ceil(text.length / 153)} texts
            </span>
          )}
        </div>
      </div>

      <p className="hint mt-2 max-w-prose">
        Marie and Sarah are stand-ins; the real name, time and person go in when it sends.{" "}
        {sender.number ? (
          <>
            It arrives from the number your customers already have, so it reads as you rather
            than as a stranger &mdash; and anybody who replies to it lands in your inbox.
          </>
        ) : (
          <>
            You have no number yet, so nothing will send. Ask us and we will set one up.
          </>
        )}
        {sender.number && !sender.ready && (
          <> Sending is not switched on at our end yet, so nothing goes out until it is.</>
        )}
      </p>
    </div>
  );
}

export function ReminderEditor({
  reminder,
  index,
  /**
   * Whose it is. True writes it against the signed-in person rather than the
   * business — which person that is gets decided by the action, from the
   * session, and never from this page.
   */
  mine = false,
  sender,
}: {
  reminder?: ReminderTemplateRow;
  index: number;
  mine?: boolean;
  /** Who this arrives from, and what a customer sees on their phone. */
  sender: Sender;
}) {
  const [state, action] = useActionState<FormState, FormData>(saveReminder, {});

  /*
   * Controlled, only so the preview can follow it.
   *
   * The textarea was uncontrolled and there was no reason for it to be
   * otherwise until something had to read it as it was typed. The form still
   * submits the same field the same way.
   */
  const [body, setBody] = useState(reminder?.body ?? "");
  const wrong = unknownPlaceholders(body);

  return (
    <form action={action} className="card space-y-4 p-5">
      {reminder && <input type="hidden" name="id" value={reminder.id} />}
      {mine && <input type="hidden" name="mine" value="1" />}
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
          value={body}
          onChange={(e) => setBody(e.target.value)}
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

      <Preview body={body} sender={sender} />

      {/*
        * A mistyped placeholder fails silently, in the worst place there is.
        * {{firstname}} for {{name}} does not error — it is stripped, and a
        * customer gets "See you tomorrow, ." Nothing in the product could say
        * so, although the check that finds it has existed since the day the
        * renderer was written and has been called by nothing since.
        */}
      {wrong.length > 0 && (
        <p className="rounded-lg bg-warn/10 px-3 py-2 text-sm text-warn">
          <strong>
            {wrong.length === 1 ? "This is not one of them:" : "These are not any of them:"}
          </strong>{" "}
          {wrong.map((w) => `{{${w}}}`).join(", ")} &mdash; it will be taken out and leave a
          gap in the sentence. The four above are the whole list.
        </p>
      )}

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
