/**
 * Wordings to start a reminder or a confirmation from.
 *
 * Giles, 28 Sep: "when setting up the booking confirmation there needs to be a
 * template to use."
 *
 * There was not one. A trade pack ships two reminders — two days before and the
 * day before — and a confirmation is neither of those: it is a reminder set to
 * zero hours, and nothing has ever shipped one. So a business switching
 * confirmations on got an empty box and a grey line of example text, and had to
 * invent the most-read message the product sends. Amber's is the tenth business
 * set up and the tenth time that has happened.
 *
 * A confirmation is worth shipping a wording for more than a reminder is,
 * because of when it arrives. It is read straight after somebody books, while
 * they are still deciding whether this business has its act together, and it is
 * the one message that is read every single time.
 *
 * ── What is deliberately not here ───────────────────────────────────────────
 *
 * No prices, no promises about how much notice is needed to cancel, nothing a
 * business would have to correct before it was safe to send. A business's own
 * cancellation policy is a field it has already filled in and the email
 * template already carries it; repeating a guess at it in the wording is how a
 * starter becomes a liability. Everything here is a sentence somebody would
 * have typed anyway.
 *
 * Kept short for the same reason as the quick messages: a picker of three is
 * read, a picker of twelve is scrolled past and the box gets typed into.
 */

export type Starter = {
  label: string;
  body: string;
};

/**
 * Whether the business goes to the customer or the customer comes to them.
 *
 * The same split the trade packs already make for their two reminders, and it
 * changes the sentence rather than decorating it: "you're booked in with Amber"
 * is wrong for a dog walker and "Amber will be with you" is wrong for a salon.
 */
export type Where = { travels: boolean };

/** What to say as soon as somebody books. */
export function confirmationStarters({ travels }: Where): Starter[] {
  return [
    {
      label: "Short and plain",
      body: travels
        ? "That's booked in, {{name}}. {{practitioner}} will be with you {{when}}. Anything changes, just reply to this."
        : "That's booked in, {{name}}, {{when}} with {{practitioner}}. Anything changes, just reply to this.",
    },
    {
      label: "Warmer",
      body: travels
        ? "Thanks {{name}}, all booked. {{practitioner}} from {{business}} will be with you {{when}}. We'll see you then, and if anything changes just reply here and we'll sort it."
        : "Thanks {{name}}, all booked. You're in with {{practitioner}} at {{business}} {{when}}. We'll see you then, and if anything changes just reply here and we'll sort it.",
    },
    {
      /*
       * The one that earns its place.
       *
       * {{link}} is the customer's own page for the appointment: the time, what
       * it comes to, what a deposit has covered, the business's own policy, and
       * a button that puts it in their calendar. An email gets that button
       * whether or not the wording asks, so this option is really about the
       * text — where the link is the difference between somebody scrolling back
       * through their messages in a fortnight and somebody tapping once.
       */
      label: "With their own page",
      body: travels
        ? "All booked, {{name}}. {{practitioner}} will be with you {{when}}. Everything's here, including how to change it: {{link}}"
        : "All booked, {{name}}, {{when}} with {{practitioner}}. Everything's here, including how to change it: {{link}}",
    },
  ];
}

/** What to say before the appointment. */
export function reminderStarters({ travels }: Where): Starter[] {
  return [
    {
      label: "The day before",
      body: travels
        ? "See you tomorrow, {{name}}, {{practitioner}} will be with you {{when}}. Reply here if anything's changed."
        : "See you tomorrow, {{name}}, {{when}} with {{practitioner}}. Reply here if anything's changed.",
    },
    {
      label: "A couple of days before",
      body: travels
        ? "Hi {{name}}, {{practitioner}} from {{business}} is booked to come out to you {{when}}. Please make sure there's somewhere to park and access to the work. Need to move it? Just reply here."
        : "Hi {{name}}, you're booked in with {{practitioner}} at {{business}} {{when}}. Need to move it? Just reply here.",
    },
    {
      /*
       * The one a business asks for once it has had a few no-shows, and the
       * reason it is worth offering rather than leaving them to write it: the
       * polite version of "please don't waste my time" is hard to word, and the
       * version somebody writes while annoyed goes out to everybody.
       */
      label: "Asking them to confirm",
      body: travels
        ? "Hi {{name}}, {{practitioner}} is due with you {{when}}. Could you reply yes to let us know that still suits? If it doesn't, no problem at all. Tell us and we'll find another time."
        : "Hi {{name}}, you're in {{when}} with {{practitioner}}. Could you reply yes to let us know that still suits? If it doesn't, no problem at all. Tell us and we'll find another time.",
    },
  ];
}

/**
 * The starters for whichever this is.
 *
 * `confirmation` is what the editor already calls zero-hours-before, asked as a
 * question in words rather than as a number nobody would guess.
 */
export function startersFor(confirmation: boolean, where: Where): Starter[] {
  return confirmation ? confirmationStarters(where) : reminderStarters(where);
}
