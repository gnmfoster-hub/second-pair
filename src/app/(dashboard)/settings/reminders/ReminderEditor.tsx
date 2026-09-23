"use client";

import { Explain } from "@/components/Explain";

import { useActionState, useState } from "react";
import { saveReminder } from "./actions";
import { Field, FormMessage, SubmitButton } from "@/components/Form";
import type { FormState } from "../actions";
import { renderReminder, unknownPlaceholders } from "@/lib/reminderText";
import { HowItLands } from "@/components/HowItLands";

export type ReminderTemplateRow = {
  id: string;
  label: string;
  hours_before: number;
  body: string;
  enabled: boolean;
  sort_order: number;
  /** How this one goes out. "default" follows the business's setting. */
  channels?: string | null;
  /**
   * Whose it is — null for the business's.
   *
   * Here because the owner's page listed everybody's in one editable list, and
   * saving somebody else's from there wrote artist_id back to null: a stylist's
   * own reminder quietly became the shop's, and she would only find out when
   * her clients stopped getting the one she wrote.
   */
  artist_id?: string | null;
};

/** Substitutions the owner can use, explained where they are typed. */
const TOKENS = [
  ["{{name}}", "their first name"],
  ["{{when}}", "the day and time"],
  ["{{practitioner}}", "who it is with"],
  ["{{business}}", "your name"],
  /*
   * The link is optional in a text and automatic in an email.
   *
   * An email gets a button whether or not this is used, because a button is
   * chrome rather than part of the sentence. A text only gets it if the
   * business asks, because every character past a hundred and sixty costs
   * them money and appending a URL nobody wrote changes what they chose to
   * say.
   */
  ["{{link}}", "their own page for this appointment — email always has a button"],
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
function Preview({
  body,
  sender,
  business,
  photoUrl,
  policy,
}: {
  body: string;
  sender: Sender;
  business: string;
  photoUrl?: string | null;
  policy?: string | null;
}) {
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
    link: "https://www.second-pair.com/b/example",
  });

  return (
    <div>
      {/*
        * Both channels now, not just the phone.
        *
        * Giles: can we see the email that goes out. The same wording arrives
        * as an email for anybody who came in by email, and nobody had ever
        * seen what that looked like — see HowItLands, which renders each with
        * the code that sends it.
        */}
      <HowItLands
        text={text}
        business={business}
        photoUrl={photoUrl}
        policy={policy}
        /* The email's button, which is not part of their sentence. */
        action={{ label: "See your appointment", url: "https://www.second-pair.com/b/example" }}
      />

      <div className="hint mt-2">
        <Explain label="What this preview is showing">
          Marie and Sarah are stand-ins. The real name, time and person go in when it
          sends, and this is filled by the same code that fills the real one, so a
          preview that renders a template its own way is a preview that can be wrong.
        </Explain>
      </div>

      <p className="hint mt-2 max-w-prose">
        {sender.number ? (
          <>
            A text arrives from {sender.number}, the number your customers already have, so
            it reads as you rather than as a stranger, and anybody who replies to it lands
            in your inbox.
          </>
        ) : (
          <>
            You have no number yet, so nothing can be texted. Email still works. Ask us and
            we will set one up.
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
  /** The business's picture and policy, so the email preview is the real one. */
  look,
  mayUseBoth = false,
}: {
  reminder?: ReminderTemplateRow;
  index: number;
  mine?: boolean;
  /** Who this arrives from, and what a customer sees on their phone. */
  sender: Sender;
  look?: { photoUrl?: string | null; policy?: string | null };
  /** Whether this business may send one message on two channels. */
  mayUseBoth?: boolean;
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

  /*
   * Whether this one is the confirmation.
   *
   * Zero hours before is what the database calls it — see the migration. The
   * form asks the question in words and turns the answer back into the
   * number, so nothing downstream learns a second concept.
   */
  const [confirmation, setConfirmation] = useState(reminder?.hours_before === 0);

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
            placeholder={confirmation ? "Booking confirmation" : "The day before"}
            className="input"
          />
        </Field>
        {/*
          * When it goes, as a choice rather than a number somebody has to
          * know the trick for.
          *
          * The database says a confirmation is a reminder set to zero hours
          * before, which is the right thing for the database and a terrible
          * thing to ask an owner to type. Nobody guesses that "0" means "as
          * they book", and a business that wanted confirmations would have
          * gone looking for a feature that was already here.
          */}
        <Field label="When it goes">
          <select
            name="when"
            value={confirmation ? "book" : "before"}
            onChange={(e) => setConfirmation(e.target.value === "book")}
            className="input w-56"
          >
            <option value="book">As soon as they book</option>
            <option value="before">Before the appointment</option>
          </select>
        </Field>
      </div>

      {/*
        * The hours, only when they mean anything.
        *
        * Kept mounted rather than removed so a confirmation still submits a
        * hours_before the action can read, and so switching back does not
        * lose what was typed.
        */}
      <div className={confirmation ? "hidden" : ""}>
        <Field label="How many hours before">
          <input
            type="number"
            name="hours_before"
            min={1}
            max={720}
            defaultValue={reminder?.hours_before ? reminder.hours_before : 24}
            className="input w-32"
          />
        </Field>
      </div>

      {/*
        * How this one goes out, where it differs from the business's answer.
        *
        * "Both" is only listed where it has been sold. A disabled control
        * saying "ask us" is an advert; one that is simply absent is a product
        * that knows what it sells.
        */}
      <Field
        label="How this one goes"
        hint="Leave it following your setting unless this message wants something different."
      >
        <select
          name="channels"
          defaultValue={reminder?.channels ?? "default"}
          className="input w-64"
        >
          <option value="default">However you send everything else</option>
          <option value="email">Email only</option>
          <option value="sms">Text only</option>
          {mayUseBoth && <option value="both">Email and text</option>}
        </select>
      </Field>

      <Field
        label="What it says"
        explain={TOKENS.map(([token, means]) => `${token} is ${means}`).join("; ")}
      >
        <textarea
          name="body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          className="input"
          placeholder={
            confirmation
              ? "Thanks {{name}}, you are booked in for {{when}} with {{practitioner}}."
              : "See you tomorrow, {{name}} — {{when}} with {{practitioner}}."
          }
          required
        />
      </Field>

      <Preview
        body={body}
        sender={sender}
        business={sender.business}
        photoUrl={look?.photoUrl}
        policy={look?.policy}
      />

      {confirmation && (
        <p className="hint max-w-prose">
          This one goes out as soon as the booking is made, on whichever channel they
          came in on. {"{{when}}"} is still the appointment, so it can say what they have
          booked as well as that it went through. It is sent once, and moving the
          appointment later does not send it again.
        </p>
      )}

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
          {wrong.map((w) => `{{${w}}}`).join(", ")}, it will be taken out and leave a
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
        <SubmitButton className="btn-ghost">
          {reminder ? "Save" : confirmation ? "Add confirmation" : "Add reminder"}
        </SubmitButton>
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
