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
 * The website is not on the list and that is the whole point of the list.
 * saveContact deliberately moves a conversation onto an existing client
 * record when somebody gives a phone number or an email already on file and a
 * first name that agrees, which is good behaviour and the reason a returning
 * customer's history is in front of the business rather than scattered. It
 * also means a website visitor who types a real customer's number and first
 * name is, to everything downstream, that customer. The rejoin code says it
 * plainly: on a website a phone number proves nothing at all.
 *
 * So on the website an appointment is only in reach if it was made in that
 * same conversation, which is the case that actually matters: somebody
 * cancelling over chat is nearly always cancelling what they booked minutes
 * ago. A returning customer wanting an older one moved is handed to a person,
 * and that is the right answer rather than a shortfall.
 *
 * The proved channels are listed rather than the unproved ones, so a channel
 * added later is strict until somebody decides otherwise.
 */
const PROVED = ["email", "sms", "whatsapp", "instagram", "messenger", "voice"];

/** Whether this channel's own say-so reaches every appointment on the record. */
export function reachesWholeRecord(channel: string | null | undefined): boolean {
  return PROVED.includes(String(channel ?? ""));
}
