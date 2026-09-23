/**
 * Wordings a business picks from when messaging a client by hand.
 *
 * Giles: "would be good to be able to send emails/messages to the clients in
 * the client page record a copy and have templates etc."
 *
 * The copy was already kept — a message sent from a client's page is written
 * into their conversation with the delivery recorded beside it. This is the
 * other half.
 *
 * Every business has five or six messages it sends constantly: running late, a
 * cancellation has come up, sorry we missed you. Each gets retyped slightly
 * differently several times a week, and the third version is never as good as
 * the first.
 *
 * Not reminders, which are scheduled against an appointment and sent by the
 * machine. These are chosen by a person, in the moment, and edited before they
 * go — which is why the picker fills the box rather than sending anything.
 *
 * The same {{name}} placeholders as reminders on purpose: a business that has
 * learnt one way of writing a template should not have to learn a second.
 */

import { renderReminder } from "./reminderText.ts";

export type QuickMessage = {
  id: string;
  label: string;
  body: string;
};

/**
 * What a business starts with, before it writes its own.
 *
 * Wording only — no prices, no promises about timing, nothing a business would
 * have to correct before it was safe to send. Every one is a sentence somebody
 * would type anyway, which is the whole point: the starter is right often
 * enough to be worth keeping and plain enough to be worth editing.
 *
 * Kept deliberately short. A picker of six is read; a picker of twenty is
 * scrolled past and the box gets typed into instead.
 */
export const STARTERS: { label: string; body: string }[] = [
  {
    label: "Running late",
    body: "Hi {{name}}, so sorry — we're running about fifteen minutes behind today. You're still very much booked in, just wanted you to know so you're not waiting.",
  },
  {
    label: "A slot has come up",
    body: "Hi {{name}}, a cancellation has just come up and I thought of you. Want it? First to say yes gets it.",
  },
  {
    label: "Sorry we missed you",
    body: "Hi {{name}}, sorry we missed you today. No hard feelings at all — just let us know when you'd like to come in and we'll sort something out.",
  },
  {
    label: "Thanks for coming in",
    body: "Thanks for coming in today {{name}} — lovely to see you. Anything at all you're not happy with, tell us and we'll put it right.",
  },
  {
    label: "Chasing a deposit",
    body: "Hi {{name}}, just a nudge about the deposit for your appointment — it's not gone through yet and the slot is only held until it does. Any trouble with the link, tell me and I'll sort it.",
  },
  {
    label: "We're closed that day",
    body: "Hi {{name}}, just to let you know we're closed on the day you asked about. Happy to find you another time that works — what suits?",
  },
];

/**
 * One template, ready to drop into the box.
 *
 * Filled rather than pasted raw, because a picker that puts "{{name}}" into
 * the box makes every single use a find-and-replace, and the one time somebody
 * forgets, a customer is addressed as a curly brace.
 *
 * `when` and `link` are deliberately not offered. An ad-hoc message is not
 * attached to an appointment, so there is no honest value for either, and
 * renderReminder strips what it cannot fill — which is the right outcome and
 * the reason nothing here has to guard against it.
 */
export function fillFor(
  body: string,
  who: { name?: string | null; business?: string | null; practitioner?: string | null },
): string {
  return renderReminder(body, {
    name: firstNameOf(who.name),
    business: who.business ?? null,
    practitioner: who.practitioner ?? null,
  });
}

/**
 * The name somebody is actually called.
 *
 * "Hi Margaret Thatcher-Wilson" is not how anybody greets a customer they
 * know, and the contact record holds whatever was typed when they first got in
 * touch. Reminders already do this; this matches them.
 */
export function firstNameOf(name: string | null | undefined): string {
  const first = (name ?? "").trim().split(/\s+/)[0] ?? "";
  return first;
}
