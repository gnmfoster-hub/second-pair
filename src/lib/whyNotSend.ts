/**
 * Whether a reminder that is due should actually go out.
 *
 * Being due is not the same as being worth sending. The appointment may have
 * been cancelled since, or already happened, or the reminder it came from may
 * have been deleted — and a reminder that goes out anyway is the worst kind of
 * message this product can send: it tells somebody to turn up to something
 * that is not happening, in the business's own name.
 *
 * Pulled out of the sender and named because something else now leans on it.
 * Cancelling an appointment marks it cancelled and then drops its reminders,
 * in that order, and the second half is allowed to fail precisely because this
 * check runs again at send time. That makes this the net under the whole
 * cancellation path, and a net wants a test rather than three lines buried in
 * a loop that only runs against a real database.
 */

export type ReminderBooking = {
  starts_at: string;
  cancelled_at: string | null;
} | null;

/**
 * The reason not to send, or null to go ahead.
 *
 * A reason rather than a boolean: it is written to the row, so whoever looks
 * later can tell "cancelled" from "we could not reach them", which are
 * different problems with different fixes.
 */
export function whyNotSend(
  booking: ReminderBooking | undefined,
  hasTemplate: boolean,
  now: Date,
): string | null {
  if (!booking) return "The appointment is no longer there.";
  if (booking.cancelled_at) return "The appointment was cancelled.";

  /*
   * An appointment in the past is never reminded about.
   *
   * A reminder left waiting for a channel would otherwise go out the day a
   * text number is connected, for something weeks gone.
   */
  const starts = Date.parse(booking.starts_at);

  /*
   * An unreadable date counts as a reason not to send.
   *
   * Date.parse returns NaN, and every comparison with NaN is false — so a
   * booking whose time could not be read looked like one comfortably in the
   * future and the reminder went out. Whatever is wrong with that row, the
   * answer is not to text somebody a time nobody can read.
   */
  if (!Number.isFinite(starts)) return "The appointment has no readable time.";
  if (starts <= now.getTime()) return "The appointment has already happened.";

  // No body means the reminder was deleted or switched off after this one was
  // queued. Either way it is not sent, and the row says so.
  if (!hasTemplate) return "The reminder it came from is gone.";

  return null;
}
