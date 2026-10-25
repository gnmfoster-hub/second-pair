/**
 * Which appointment a customer means, and whether this may touch it.
 *
 * Giles, 22 October: "I believe she had a booking and contacted to change it,
 * as far as I can see this wasn't an easy process for her."
 *
 * It was not a process at all. The assistant could put something in the diary
 * and could not touch it again, and the system prompt said so in as many
 * words: "You cannot cancel, move or change an appointment that is already
 * booked. There is no tool for it." So every customer wanting the one thing
 * customers most often want got the same answer, that it had been passed on
 * and somebody would confirm, and then waited. Jess asked thirty seconds
 * after booking and again by email four minutes later. Hers was taken out of
 * the diary by hand the next day and nobody ever told her.
 *
 * This file is only the choosing. It holds no database and sends nothing, so
 * the rules below can be read in one sitting and tested without a server,
 * which matters more here than anywhere else in the product: the cost of
 * getting the choice wrong is cancelling an appointment nobody asked about.
 *
 * Three rules, in order.
 *
 *   1. Nothing in the past. An appointment that has happened is history
 *      rather than a plan, and "cancel my Tuesday" on a Wednesday means next
 *      Tuesday.
 *   2. The one they named, matched to the minute. Where they named nothing,
 *      or named a time nothing sits at, and they have exactly one appointment
 *      ahead of them, that is the one, because there is nothing else they
 *      could mean. Where they have several and have named none, it asks. The
 *      cost of a guess here is somebody else's Saturday.
 *   3. A standing run and a group booking are both handed to a person.
 *      "Cancel my Tuesday" against a weekly clean means one of six things and
 *      five of them are wrong. A person can read the sentence; this cannot.
 *      What counts as a standing run is not obvious: see standingRun below,
 *      because the obvious test refuses every booking ever made.
 *
 * What is NOT in here, deliberately, is who is allowed to ask. The rows are
 * scoped before they reach this, and the rule for that is at the top of
 * change.ts, because it turns on how a conversation comes to be attached to a
 * client record rather than on anything about an appointment.
 */

/** The columns the choosing needs. Any row with these will do. */
export type Candidate = {
  id: string;
  starts_at: string;
  repeats?: string | null;
  repeat_parent_id?: string | null;
  group_id?: string | null;
};

export type Which<T> =
  | { ok: true; booking: T }
  | { ok: false; because: string; handToAPerson: boolean };

/** To the minute, because seconds are an accident of how a row was written. */
const sameMinute = (a: number, b: number) => Math.floor(a / 60_000) === Math.floor(b / 60_000);

/**
 * Whether this row is actually one of a repeating set.
 *
 * `repeats` is a postgres enum, `not null default 'none'`, so every ordinary
 * one-off booking in the database carries the string "none" rather than a
 * null. Truthiness is the wrong test on it and a very expensive one: writing
 * `if (row.repeats)` makes every appointment ever made look like a standing
 * run, so every customer asking to cancel is told only a person can do it.
 *
 * Found by booking something on a demo and trying to cancel it. No fixture in
 * this file would ever have caught it, because a fixture written by hand
 * leaves the field out and an empty field is falsy. The database's own
 * default is the thing that bites, and only a real row carries it.
 */
const standingRun = (row: Candidate): boolean => {
  const rule = String(row.repeats ?? "none");
  return (rule !== "none" && rule !== "") || Boolean(row.repeat_parent_id);
};

/**
 * @param rows Their own appointments, already cancelled ones left out.
 * @param asked `which` is the start time they named, as an ISO string.
 */
export function whichBooking<T extends Candidate>(
  rows: T[],
  asked: { which?: string | null; now: number },
): Which<T> {
  const ahead = rows
    .filter((b) => Date.parse(b.starts_at) >= asked.now)
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));

  if (!ahead.length) {
    return {
      ok: false,
      because: "they have nothing booked that has not already happened",
      handToAPerson: false,
    };
  }

  const when = asked.which ? Date.parse(asked.which) : NaN;

  /*
   * The named one, or the only one.
   *
   * Falling back to the only one even when they named a time that misses it
   * is on purpose: somebody with a single appointment who misremembers the
   * hour still means that appointment, and every reply says back the time it
   * actually moved or cancelled, so a wrong hour is visible to them straight
   * away rather than silently obeyed.
   */
  const named =
    (Number.isFinite(when) ? ahead.find((b) => sameMinute(Date.parse(b.starts_at), when)) : undefined) ??
    (ahead.length === 1 ? ahead[0] : undefined);

  if (!named) {
    return {
      ok: false,
      because: `they have ${ahead.length} appointments booked, so ask which one they mean before doing anything`,
      handToAPerson: false,
    };
  }

  if (standingRun(named)) {
    return { ok: false, because: "it is one of a standing run of appointments", handToAPerson: true };
  }

  if (named.group_id) {
    return { ok: false, because: "it is part of a group booking", handToAPerson: true };
  }

  return { ok: true, booking: named };
}
