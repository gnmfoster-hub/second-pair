import { PROVIDERS, type ProviderKind } from "./provider.ts";

/**
 * Whether the assistant may touch an appointment that is already in the diary.
 *
 * Two conditions, and they are needed in two places: tools.ts decides whether
 * to hand the model the tools, and prompt.ts decides whether to tell it they
 * exist. Those two answers disagreeing is the worst outcome available here.
 * One of them promises a customer something that cannot happen, which is the
 * precise fault this piece of work exists to undo, and the other leaves a
 * tool sitting unused while people are told to ring up.
 *
 * So it is one function rather than the same expression typed out twice. It
 * imports nothing but the provider table, which is a plain object, so both
 * callers can have it and so can a test.
 *
 * @param bookingPerson Whoever would be booked. prompt.ts passes the first
 *   person this channel may offer; tools.ts passes the first active one. They
 *   can differ on somebody's own Instagram, and that is the same difference
 *   create_booking has always had.
 */
export function mayChangeBookings(
  studio: { assistant_may_change_bookings?: boolean },
  bookingPerson: { booking_provider?: string | null } | undefined,
): boolean {
  /*
   * The business's word first, and only an explicit no counts.
   *
   * Undefined is a yes. The column arrives with a migration run by hand, and
   * the answer must not change in the window between the deploy and the
   * migration: a feature that switches itself off for a day is worse than one
   * that was never on.
   */
  if (studio.assistant_may_change_bookings === false) return false;

  /* And a diary that can actually be written to. Somebody else's booking page
     cannot be rewritten by us, so there is nothing here to cancel. */
  if (!bookingPerson) return false;

  const kind = (bookingPerson.booking_provider as ProviderKind) ?? "native";
  return (PROVIDERS[kind] ?? PROVIDERS.manual).writesBookings;
}

/**
 * Channels where the thread key is something the person had to possess.
 *
 * A reply arrives at a mailbox we hold, from an address, from a number, or
 * from an account somebody logged into. Not proof of identity in the legal
 * sense, and plenty for deciding whether somebody may move their own haircut.
 *
 * The website is not on the list, and what that now decides is one thing
 * only: whether an empty answer may be stated as a fact. On the website it
 * may not. Anybody who has not given an email or a number is a stranger to
 * us however well we know their name, so "nothing is booked" is a claim this
 * code cannot make, and making it is what told Giles he had no appointment
 * when he had one. It asks for the address or the number instead.
 *
 * It used to decide more than that. The website could only reach an
 * appointment made in that same conversation, on the reasoning that a number
 * typed into a web page proves nothing, which is true as far as it goes.
 *
 * Giles, 25 October, having walked the whole flow: "it should be able to
 * change as long as there is time in the diary but only if it was an
 * assistant booking in the first place." He is right about where the line
 * belongs. His own clean, identified by his own email, was refused twice and
 * handed to Karen, which is the stall this work existed to remove. The useful
 * question is not which chat window a booking came through, it is whose
 * booking it is to change: one the assistant took is the assistant's to move,
 * and one the business typed into the diary themselves is theirs. That is in
 * whichBooking, read off `source`.
 *
 * What stands between a stranger and somebody else's appointment is then the
 * client record itself: saveContact only moves a conversation onto an
 * existing record when the email or the number given is already on it AND
 * the first name agrees. So it takes knowing a customer's address and their
 * name, and if somebody does, the customer is emailed about the change and
 * the business is alerted, both within the minute. Giles's call, made with
 * that in front of him.
 *
 * The proved channels are listed rather than the unproved ones, so a channel
 * added later is cautious until somebody decides otherwise.
 */
const PROVED = ["email", "sms", "whatsapp", "instagram", "messenger", "voice"];

/**
 * Whether the channel itself establishes who they are.
 *
 * False on the website, where an empty diary may not be stated as a fact.
 */
export function provedWhoTheyAre(channel: string | null | undefined): boolean {
  return PROVED.includes(String(channel ?? ""));
}
