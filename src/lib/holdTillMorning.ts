/**
 * Whether a reminder that is due should wait rather than go out now.
 *
 * Scheduling already keeps reminders inside waking hours: planReminders moves
 * a due time into the window and never past the appointment. That is the only
 * guard there was, and it guards the wrong clock.
 *
 * Julie Koch, Amber's Paws & Pastures, 15 October. Two reminders due at 12:00
 * and at 16:00, both perfectly sensible times. They were sent at 23:08 and at
 * 23:52, because the sweep that sends them had not run since the afternoon,
 * and when it finally ran it sent everything it found. The due time was right
 * and the send time was eleven at night.
 *
 * So there are two questions, not one. "When should this land" is answered
 * when the booking is made, in reminderSchedule.ts. "Is now a reasonable
 * moment to be texting somebody" can only be answered when the sweep actually
 * runs, which is here.
 *
 * Holding costs nothing: the row stays pending and the next sweep asks again.
 * The only way holding can hurt is if it holds past the appointment, and that
 * is the whole of the complication below.
 */

import { OPENS, SHUTS, localHour } from "./reminderSchedule.ts";

/**
 * How late the sweep can be.
 *
 * Not a guess. The GitHub workflow that sends these says it runs every five
 * minutes and reports every run as a success, and the reminders it actually
 * sent on 15 October are stamped 01:40, 06:14, 11:00 and 15:52 — gaps of
 * four and three quarter hours. Until that is fixed, "wait until the morning"
 * means "wait until some time in the morning", and anything inside five hours
 * of the appointment is not safe to wait for.
 *
 * A late text is an annoyance. A reminder held so long that the appointment
 * passes is never sent at all, and whyNotSend then records it as skipped,
 * which looks deliberate. Late beats never, every time.
 */
const SWEEP_CAN_BE_LATE_HOURS = 5;

/**
 * The reason to wait, or null to send now.
 *
 * A reason rather than a boolean so the sweep can say what it did; nothing is
 * written to the row, because a held reminder is an ordinary pending one and
 * must stay that way for the next sweep to find it.
 *
 * @param now when the sweep is running
 * @param startsAt the appointment, as stored
 * @param timeZone the business's own time, so "night" means night where they are
 * @param confirmation true for the one sent as the booking is made
 */
export function holdTillMorning(
  now: number,
  startsAt: string,
  timeZone: string,
  confirmation: boolean,
): string | null {
  /*
   * A confirmation goes out whatever the hour.
   *
   * Somebody who has just booked at half past eleven at night is sitting
   * there waiting to be told it worked, and a confirmation that arrives nine
   * hours later is not a confirmation.
   */
  if (confirmation) return null;

  const hour = localHour(now, timeZone);
  if (hour === null) return null;
  if (hour >= OPENS && hour < SHUTS) return null;

  const start = Date.parse(startsAt);
  /* Unreadable times are whyNotSend's problem, not this one. */
  if (!Number.isFinite(start)) return null;

  /*
   * Roughly when the business is next awake.
   *
   * Rounded to the hour on purpose: the row stays pending and this is asked
   * again at the next sweep, so this only has to be good enough to answer
   * "is there room to wait", and an hour either way does not change that
   * answer once there are five hours of slack in it.
   */
  const hoursToMorning = hour < OPENS ? OPENS - hour : 24 - hour + OPENS;
  const morning = now + hoursToMorning * 3600_000;

  if (morning + SWEEP_CAN_BE_LATE_HOURS * 3600_000 >= start) return null;

  return "Held until the morning rather than sent overnight.";
}
