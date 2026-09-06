/**
 * The parts of a reply that should not be prose.
 *
 * The assistant has always been able to offer times, quote a price, book a
 * slot and ask for a deposit — and all of it came out as a sentence the
 * customer then had to answer in words. "Tuesday 9am or Thursday 1pm, either
 * any good?" asks somebody standing in a supermarket to type "thursday
 * please" correctly enough to be understood, and every one of those typed
 * replies is a chance to lose them.
 *
 * So the engine now says what it did as well as what it said. The words stay
 * exactly as they were — they carry the tone, and they are what gets stored,
 * sent by text message and read back later. These ride alongside, and only the
 * widget uses them: a time becomes a button, a price becomes a card, a booking
 * becomes something you can put in your own calendar.
 *
 * Nothing here is authoritative. Every one of these is a record of a decision
 * already taken and already written to the database — tapping a time sends a
 * message like any other, and the assistant books it the same way it always
 * did. A widget that lied about these could not book anything it was not
 * already offered.
 */

export type Moment =
  | {
      kind: "slots";
      person: string;
      minutes: number;
      /**
       * A first look, or the work itself.
       *
       * Without this the card read "30 minutes with Dave Bone" directly under a
       * quote saying two to two and a half hours, which invites somebody to
       * think the job just got shorter. It is a consultation, and saying so
       * costs one word.
       */
      appointment: "consultation" | "session";
      /**
       * What the assistant is allowed to offer, in the order it offered them.
       *
       * Broken into parts as well as a whole sentence, so the widget can set
       * them like a departure board — the day quiet, the time loud — without
       * reformatting a date in the visitor's timezone and quietly offering a
       * London salon's ten o'clock to somebody in New York as five in the
       * morning. The parts are cut here, where the business's own timezone is
       * known for certain.
       */
      slots: { startsAt: string; label: string; day: string; time: string }[];
    }
  | {
      kind: "quote";
      label: string;
      person: string | null;
      lowPence: number;
      highPence: number;
      /** "plus VAT", when they are registered. */
      note: string | null;
      depositPence: number;
      hoursLow: number;
      hoursHigh: number;
      needsConsultation: boolean;
    }
  | {
      kind: "booked";
      person: string;
      startsAt: string;
      endsAt: string;
      label: string;
      /** The same two parts the slots carry, cut in the business's timezone. */
      day: string;
      time: string;
      /** Held pending a deposit, rather than confirmed outright. */
      held: boolean;
    }
  | { kind: "deposit"; amountPence: number; url: string }
  | { kind: "handover"; person: string | null };

/**
 * What is still worth drawing once the turn is over.
 *
 * Cards are collected as the assistant works, and a single turn can both offer
 * times and take one of them — ask for "the first Thursday at nine" and the
 * assistant looks the day up and books it without coming back to you. Both
 * cards were then drawn, so the confirmation arrived with a row of time
 * buttons sitting underneath it, still tappable, offering a choice that had
 * just been made. The obvious thing to do with a button is press it.
 *
 * A price is different and stays: what it costs is worth reading next to when
 * it is, and a deposit link is the whole point of the message it comes with.
 */
export function settleMoments(moments: Moment[]): Moment[] {
  const booked = moments.some((m) => m.kind === "booked");
  return booked ? moments.filter((m) => m.kind !== "slots") : moments;
}
