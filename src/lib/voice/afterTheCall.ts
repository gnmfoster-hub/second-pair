/**
 * What a caller has in writing when they hang up.
 *
 * Nothing, until this. The confirmation that goes out after a booking is an
 * email carrying a calendar file, and it is the right thing on every channel
 * where an email address is a normal thing to have. On the telephone it is
 * not: somebody rings, says their name and takes a Tuesday, and at no point in
 * that conversation is there a natural moment to spell out an email address —
 * so `sendBookingConfirmation` finds no address and correctly does nothing.
 *
 * Which leaves the one channel where the customer cannot scroll back as the
 * one channel where they get nothing. Over text the appointment is sitting in
 * their messages. On a call it was said once, out loud, to somebody who was
 * probably driving.
 *
 * So a text goes to the number they rang from, with the same three facts the
 * email carries and nothing else: what, when, and the page where they can
 * change it. We already know the number — it is how the call arrived.
 *
 * The composing half is here and pure, because the wording is the part worth
 * testing and the sending is the part that needs a live Twilio.
 */

/** Held for a person to confirm, or booked outright. Not the deposit hold. */
export type AfterCall = {
  /** "Tuesday 9 October" — already cut in the business's own timezone. */
  day: string;
  /** "2:30pm", likewise. */
  time: string;
  /** Whose diary it is. */
  person: string;
  /** The business, so a text out of context still says who it is from. */
  business: string;
  /** Where they can see and change it. Empty when there is no link to give. */
  url: string;
  /**
   * Waiting on somebody to look at it.
   *
   * The Receptionist holds what it books by default, because hearing a name
   * or a time wrong is the one failure the telephone adds. Saying so is not
   * an apology — it is the difference between "you are booked" and "you are
   * pencilled in", and a customer who turns up to a slot that was never
   * confirmed has been let down by this sentence being missing.
   */
  held: boolean;
};

/**
 * The message itself.
 *
 * Deliberately short. It arrives seconds after a phone call the person has
 * just had, so it does not need to re-introduce itself or explain what it is
 * about — it needs to be the bit they could not write down.
 *
 * The link is last and on its own line, because that is where a phone puts
 * the preview and because everything before it should be readable in the
 * notification without opening anything.
 */
export function afterCallText(booking: AfterCall): string {
  const when = `${booking.day} at ${booking.time}`;

  const opening = booking.held
    ? `Thanks for calling ${booking.business}. We have pencilled you in with ${booking.person} on ${when} and will confirm it shortly.`
    : `Thanks for calling ${booking.business}. You are booked in with ${booking.person} on ${when}.`;

  /*
   * No link, no second sentence. A trailing "you can change it here:" with
   * nothing after it is worse than not offering, and a booking with no public
   * token is rare enough not to be worth a third wording.
   */
  if (!booking.url) return opening;

  return `${opening}\n\nChange or cancel it here: ${booking.url}`;
}
