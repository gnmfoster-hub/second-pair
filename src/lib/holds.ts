/**
 * A slot being held while somebody pays a deposit.
 *
 * The most urgent thing a diary can contain, and the diary could not see it.
 *
 * When the assistant books something that needs a deposit it writes
 * `held_until` and sends a link. If the money does not arrive by then the
 * sweep cancels the booking and the slot goes back. That is the right
 * behaviour and it has worked for weeks — with one problem: on screen a held
 * slot is drawn exactly like a confirmed appointment, right up until the
 * moment it disappears.
 *
 * So an owner looking at Saturday sees a full afternoon, and an hour later
 * sees a gap, and nothing ever told them the difference. Worse in the other
 * direction: they turn away a walk-in for a slot that was never really taken.
 *
 * Pure, because the interesting part is the arithmetic near the boundary and
 * that is miserable to test against a clock.
 */

export type Hold = {
  /** Minutes left, floored. Zero means it is going now. */
  minutesLeft: number;
  /** The time is up and the sweep has not been round yet. */
  lapsed: boolean;
  /** Worth interrupting somebody about. */
  soon: boolean;
};

/** Under this many minutes left is worth saying loudly. */
export const SOON_MINUTES = 30;

/**
 * Whether this booking is being held, and for how much longer.
 *
 * Null for everything that is not a live hold — which is almost every row in a
 * diary, so the caller can treat null as "draw it normally".
 *
 * A paid deposit is not a hold. The money arrived, the booking is theirs, and
 * `held_until` is cleared when it does — but a row that still carries one is
 * read as paid rather than as held, because the money is the fact that
 * matters and clearing a column is a second write that can fail.
 */
export function holdOn(
  heldUntil: string | null | undefined,
  depositStatus: string | null | undefined,
  now: number = Date.now(),
): Hold | null {
  if (!heldUntil) return null;
  if (depositStatus === "paid" || depositStatus === "refunded") return null;

  const until = Date.parse(heldUntil);
  if (!Number.isFinite(until)) return null;

  const minutesLeft = Math.max(0, Math.floor((until - now) / 60_000));

  return {
    minutesLeft,
    lapsed: until <= now,
    soon: minutesLeft <= SOON_MINUTES,
  };
}

/**
 * How long is left, said the way somebody would say it.
 *
 * Minutes throughout the hour that matters, then hours. Nobody reads "94
 * minutes" as a length of time.
 */
export function holdLeft(hold: Hold): string {
  if (hold.lapsed) return "hold has run out";
  if (hold.minutesLeft < 60) return `${hold.minutesLeft}m left to pay`;

  const hours = Math.round(hold.minutesLeft / 60);
  return hours === 1 ? "an hour left to pay" : `${hours} hours left to pay`;
}

/**
 * The sentence for a dialog, where there is room for the consequence.
 *
 * The consequence is the point. "Held until 4:15" is a fact somebody has to
 * work out the meaning of; "the slot goes back at 4:15 if the deposit is not
 * paid" is the meaning.
 */
export function holdMeans(hold: Hold): string {
  if (hold.lapsed) {
    return "The hold has run out. This slot is about to go back into the diary — it is only still here because the sweep has not been round yet.";
  }
  return `Held while they pay the deposit. ${holdLeft(hold)}, then the slot goes back and somebody else can have it.`;
}

/**
 * The same clock with no room at all — a badge on a diary block.
 *
 * Minutes while minutes are the unit somebody would act on, then hours.
 * "179m" is technically the truth and nobody reads it as three hours.
 */
export function holdShort(hold: Hold): string {
  if (hold.lapsed) return "going";
  if (hold.minutesLeft < 60) return `${hold.minutesLeft}m`;
  return `${Math.round(hold.minutesLeft / 60)}h`;
}
