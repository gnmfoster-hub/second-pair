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


/*
 * The window a reminder may land in, in the business's own time.
 *
 * Giles, 15 October: "can we make sure all reminders are sent at sensible
 * times". There was no guard at all. due_at was the appointment minus the
 * hours, and nothing else, so the send time is whatever the appointment time
 * happens to be: a seven o'clock dog walk with a reminder the day before
 * texts somebody at seven in the morning, and a twelve hour reminder on a
 * nine o'clock appointment arrives at nine the night before.
 *
 * Measured before changing anything: of 400 queued reminders, 397 already
 * fell between eight and eleven in the morning, and the three outside were
 * all stranded ones from weeks ago. So this has not bitten yet. It is luck
 * rather than design, because appointments cluster in the working day.
 */
const OPENS = 8;
const SHUTS = 20;

/**
 * Nudge a send time into waking hours, and never past the appointment.
 *
 * Too early is moved forward to eight. Too late is moved BACK to eight in the
 * evening rather than forward into the next morning, because the next morning
 * can be after the appointment, and a reminder that arrives afterwards is
 * worse than one that arrives a bit early.
 *
 * If the nudge would land on or after the appointment itself, the original
 * time is kept. Early beats useless.
 */
function atASensibleHour(due: number, start: number, timeZone: string): number {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hour12: false }).format(
      new Date(due),
    ),
  );
  if (!Number.isFinite(hour)) return due;
  if (hour >= OPENS && hour < SHUTS) return due;

  const shift = hour < OPENS ? OPENS - hour : SHUTS - hour;
  const moved = due + shift * 3600_000;

  /* Never on or after the appointment, and never later than it already was. */
  if (moved >= start) return due;
  return moved;
}

export function planReminders(
  templates: ScheduleTemplate[],
  startsAt: string,
  now: number,
  /** The business's own time, so "sensible" means sensible where they are. */
  timeZone = "Europe/London",
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
          due_at: new Date(
            atASensibleHour(start - t.hours_before * 3600_000, start, timeZone),
          ).toISOString(),
          confirmation: false,
        }))
        .filter((r) => Date.parse(r.due_at) > now)
    : [];

  return { confirmations, timed };
}
