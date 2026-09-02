import type { Channel } from "./types";

/**
 * Who answers this one — you, or your second pair of hands.
 *
 * The obvious feature request here is an on/off switch, and an off switch is
 * the thing I would least like to ship on its own. The single failure this
 * product exists to prevent is silence, and a switch somebody forgets to turn
 * back on produces exactly that, on the day they were too busy to notice. Every
 * rule below is therefore bounded: nothing here can leave an enquiry unanswered
 * forever, including the manual override.
 *
 * So instead of asking the owner to declare whether they are available, this
 * works it out. It already knows their opening hours and it can see their
 * diary, which between them cover almost every real case — with a client, shut,
 * or genuinely free — and none of it needs a scheduling screen or remembering.
 *
 * When they are free, they get first refusal rather than nothing: the assistant
 * waits a few minutes, the owner is told, and it only speaks if they have not.
 */

export type AnsweringMode =
  /** Answer everything, immediately. Nothing is ever waiting on the owner. */
  | "always"
  /**
   * A head start when they are free and working; the assistant takes it from
   * there when they are shut or mid-appointment. The sensible default.
   */
  | "when_free"
  /**
   * A head start on everything that can wait, evenings and weekends included.
   *
   * For the one-person business that wants its own enquiries — plenty of people
   * would rather answer a Sunday message themselves than have it answered for
   * them, and telling them their own hours forbid it would be absurd. Still
   * bounded: the assistant picks it up when the head start runs out, so
   * choosing this cannot turn into silence either.
   */
  | "always_ask_me";

export type Decision =
  | { answer: true; because: "live" | "out_of_hours" | "with_a_client" | "always" }
  | {
      answer: false;
      /** Answer then, if the owner has not. Never null — silence is always bounded. */
      holdUntil: Date;
      because: "owner_asked" | "first_refusal";
    };

/**
 * Channels where somebody is sitting there, watching it type.
 *
 * This is the distinction that matters and the one an on/off switch cannot
 * make. A text message arriving while the owner is halfway up a ladder can wait
 * five minutes and nobody notices. Somebody on the website who has just typed a
 * question is looking at the box — holding that back is not discretion, it is a
 * broken website, and they will leave and message whoever answers.
 */
const WATCHING: Channel[] = ["web", "voice"];

export function whoAnswers(input: {
  channel: Channel;
  now: Date;
  mode: AnsweringMode;
  /** The manual "I've got this", if it has not run out. */
  mineUntil: Date | null;
  /** Their own opening hours say they are shut. */
  outOfHours: boolean;
  /** The diary says an appointment is happening right now. */
  withAClient: boolean;
  /** How long a head start the owner gets. */
  firstRefusalMinutes: number;
}): Decision {
  const { channel, now, mode, mineUntil, outOfHours, withAClient } = input;

  // Somebody is watching. Nothing below is worth a broken-looking website.
  if (WATCHING.includes(channel)) return { answer: true, because: "live" };

  /*
   * An explicit instruction beats anything inferred.
   *
   * Pressing "I've got this" is a deliberate act, and second-guessing it from
   * the diary — "you say you have it, but you look busy to me" — is the kind of
   * cleverness that makes software feel like it is arguing. It still expires,
   * and the enquiry is still answered when it does, so the worst case is a
   * short wait rather than silence.
   */
  if (mineUntil && mineUntil > now) {
    return { answer: false, holdUntil: mineUntil, because: "owner_asked" };
  }

  if (mode === "always") return { answer: true, because: "always" };

  /*
   * Shut, or mid-appointment.
   *
   * On "when_free" the assistant takes these outright: their hands are provably
   * full, so a head start would only be a delay nobody uses, and this is the
   * case the product was built for. On "always_ask_me" they have said they want
   * these too, and that is theirs to decide.
   */
  if (mode === "when_free") {
    if (outOfHours) return { answer: true, because: "out_of_hours" };
    if (withAClient) return { answer: true, because: "with_a_client" };
  }

  /*
   * It can wait a moment, and they want first refusal on it. Ask them.
   *
   * Clamped rather than trusted: a zero would make the mode meaningless and a
   * large number would quietly turn the assistant off, which is the failure
   * this whole file exists to avoid.
   */
  const minutes = Math.min(60, Math.max(1, Math.round(input.firstRefusalMinutes)));
  return {
    answer: false,
    holdUntil: new Date(now.getTime() + minutes * 60_000),
    because: "first_refusal",
  };
}

/**
 * How long "I've got this" should last, in hours.
 *
 * Offered as a few fixed lengths rather than a free field. The only genuinely
 * dangerous answer is "until I say otherwise", so it is not on the list.
 */
export const OVERRIDE_HOURS = [1, 2, 4] as const;

/** The end of the working day, so an override cannot outlive the day it was set. */
export function untilEndOfDay(now: Date, closingHour = 20): Date {
  const end = new Date(now);
  end.setHours(closingHour, 0, 0, 0);
  return end > now ? end : new Date(now.getTime() + 60 * 60_000);
}
