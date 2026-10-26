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
 *   1b. Nothing in here ever tells anybody they have no appointment. Not on
 *      any channel, not even where the record is certainly theirs: whether
 *      the diary is joined up to that record is a different question, and at
 *      one live business five of twelve entries in a day had no client on
 *      them at all. The two sentences available are "I can see it" and "I
 *      cannot see it", and the second goes to a person.
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

/**
 * Whose appointment this is to change.
 *
 * Giles, 25 October: "it should be able to change as long as there is time in
 * the diary but only if it was an assistant booking in the first place."
 *
 * One the assistant took is the assistant's to move. One somebody at the
 * business typed into the diary is theirs, and reaching into it over chat
 * would be the product overstepping: they may have taken it on the phone,
 * written something against it, or promised the customer something nobody
 * here knows about.
 *
 * `source` on the booking says which. It is "assistant" for a booking taken
 * over chat, "manual" for one a person typed in, and "block" for time held
 * out of the diary which is not an appointment at all.
 */
export const madeByTheAssistant = (source: string | null | undefined): boolean =>
  String(source ?? "") === "assistant";

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
 * @param rows Their appointments that the assistant took, cancelled ones
 *   already left out.
 * @param asked `which` is the start time they named, as an ISO string.
 *   `outOfReach` is how many upcoming appointments they have that the
 *   business made itself, which is a different answer, not a smaller one.
 */
export function whichBooking<T extends Candidate>(
  rows: T[],
  asked: {
    which?: string | null;
    now: number;
    outOfReach?: number;
    /**
     * True where the channel has not proved who they are, which is the
     * website. Then an empty answer means "I cannot see one", never "you
     * have not got one". See the branch below.
     */
    unproved?: boolean;
  },
): Which<T> {
  const ahead = rows
    .filter((b) => Date.parse(b.starts_at) >= asked.now)
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));

  if (!ahead.length) {
    /*
     * They have one, and this conversation may not touch it.
     *
     * Two very different sentences, and running them together was the first
     * thing a real test of this found. Giles tried it on Neat & Tidy on 25
     * October: a fresh website chat, no email and no number given, so a fresh
     * client record, while his actual appointment sat on the record he made
     * in September. The assistant told him he did not have a booking.
     *
     * He had one. Saying otherwise is not a refusal, it is a false statement
     * about somebody's diary, and it is the worst answer available: somebody
     * told they have nothing booked either turns up anyway or does not turn
     * up at all, and both of those cost the business the appointment.
     *
     * So this is a refusal that goes to a person, with the model told in as
     * many words not to deny the appointment exists.
     */
    if (asked.outOfReach) {
      return {
        ok: false,
        because:
          "they DO have an appointment booked and it is not one of yours: the business " +
          "put it in the diary themselves, so it is theirs to change and not yours. Do " +
          "not tell them they have nothing booked, because they have. Say you can see " +
          "it, that this one has to go through the business, and that somebody will " +
          "confirm it with them",
        handToAPerson: true,
      };
    }

    /*
     * Nothing on this record, on a channel that cannot identify them.
     *
     * The second half of what Giles found on 25 October. He typed "Giles
     * test" into the website with no email and no number, so the
     * conversation got a client record of its very own, and his actual
     * appointment on the 28th sat on the record he made in September. There
     * was nothing out of reach either, because as far as the database was
     * concerned this was a different person.
     *
     * So an empty answer here is not a fact about his diary. It is a fact
     * about what this conversation can see, which is nothing, and the two
     * must not be said in the same words. What it needs is the address or
     * the number the booking was made with: give it one and saveContact
     * joins this conversation to the record that already exists, and the
     * branch above can then say the true thing.
     */
    if (asked.unproved && !rows.length) {
      return {
        ok: false,
        because:
          "this conversation has nothing booked on it, and that does NOT mean they have " +
          "nothing booked: on the website anybody who has not given an email or a number " +
          "is a stranger to us, however well you know their name. Do not tell them there " +
          "is nothing booked. Ask for the email address or the phone number the " +
          "appointment was made with, say it is so you can find the right one, save it " +
          "with save_contact, and try again. If they cannot give you either, escalate",
        handToAPerson: false,
      };
    }

    /*
     * Nothing we can see, which is not the same as nothing.
     *
     * This said "they have nothing booked that has not already happened",
     * and the assistant said it to customers as a fact about their diary.
     * Alison texted Amber's from the number on her own client record on 26
     * October about Alfie's midday walk, and was told there was nothing in.
     * There was. It was in the diary with no client record attached to it,
     * which is how five of Amber's twelve entries that day were written, and
     * filed as a block besides.
     *
     * The reasoning that allowed it was that on a proved channel the record
     * IS them, so an empty answer must be true. That is wrong, and this is
     * the second time the same mistake has been made in this file: the
     * record being theirs says nothing about whether the diary is joined up
     * to it. A business types a name into an entry and gets on with its day.
     *
     * So nothing in here ever denies an appointment again, on any channel.
     * Somebody asking to move or cancel believes they have one, and the two
     * sentences available are "I can see it" and "I cannot see it". It goes
     * to a person, which costs the business ten seconds and never costs them
     * the appointment.
     */
    return {
      ok: false,
      because:
        "you cannot see one on their record, and that is NOT the same as them not " +
        "having one: plenty of appointments are typed straight into the diary with no " +
        "client attached. Never tell them they have nothing booked. Say you cannot see " +
        "it from your end, ask what name or number it might be under in case it is " +
        "somewhere else, and get somebody to look properly",
      handToAPerson: true,
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
