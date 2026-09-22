/**
 * Which reminders a booking gets, and when each is due.
 *
 * Split out of reminders.ts for the same reason reminderCover.ts is: the rules
 * are the part that can be wrong, and reminders.ts reaches the database and
 * the messaging layer, so nothing there can be loaded by a test.
 *
 * The rules are small and every one of them has a way of being subtly wrong
 * that nobody would notice for weeks, because a reminder that goes out at the
 * wrong moment still goes out:
 *
 *   - A confirmation is a template set to zero hours before, and is due now.
 *     Doing the ordinary arithmetic on a zero puts it exactly on the
 *     appointment, which is the one moment a confirmation is no use.
 *   - A timed reminder whose moment has already passed is not scheduled at
 *     all. Booking something for tomorrow should not fire "two days before"
 *     immediately, or at all.
 *   - And that rule must not eat the confirmation, whose due time is now and
 *     so is never strictly in the future.
 *
 * Pure, and takes `now` rather than reading the clock, so those combinations
 * can be tested without a database and without waiting for a Tuesday.
 */

/** Only the parts of a template these rules read. */
export type ScheduleTemplate = {
  id: string;
  hours_before: number;
};

export type PlannedReminder = {
  template_id: string;
  due_at: string;
  /** True for the confirmation, which is written and sent differently. */
  confirmation: boolean;
};

export type Plan = {
  /** Sent as the booking is made. At most one; see the unique constraint. */
  confirmations: PlannedReminder[];
  /** Sent a set number of hours before the appointment. */
  timed: PlannedReminder[];
};

export function planReminders(
  templates: ScheduleTemplate[],
  startsAt: string,
  now: number,
): Plan {
  const start = Date.parse(startsAt);

  const confirmations = templates
    .filter((t) => t.hours_before === 0)
    .map((t) => ({
      template_id: t.id,
      due_at: new Date(now).toISOString(),
      confirmation: true,
    }));

  /*
   * An unparseable start time cannot produce a sensible reminder time, and
   * NaN comparisons are all false — so without this the timed ones would be
   * silently dropped while the confirmation still went out, which is a
   * confusing half-state to debug. Dropping them is the same outcome, said on
   * purpose.
   */
  const timed = Number.isFinite(start)
    ? templates
        .filter((t) => t.hours_before > 0)
        .map((t) => ({
          template_id: t.id,
          due_at: new Date(start - t.hours_before * 3600_000).toISOString(),
          confirmation: false,
        }))
        .filter((r) => Date.parse(r.due_at) > now)
    : [];

  return { confirmations, timed };
}
