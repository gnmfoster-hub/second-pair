/**
 * Whether a deposit was actually taken.
 *
 * The status on its own does not answer this, and every screen that asked it
 * that way was wrong. Anything typed into the diary by hand is written with a
 * deposit of nothing and a status of "paid" — not as a claim that money
 * changed hands, but to keep it away from the sweep that cancels appointments
 * whose deposit never arrived. An owner blocking out Tuesday afternoon is not
 * waiting on a payment, and that entry must not quietly disappear.
 *
 * Reasonable inside the database, and it leaked out: a tattoo studio with no
 * Stripe account at all opened its diary and read "Deposit paid" against an
 * appointment nobody had paid a penny for. On a screen about money, in a
 * business that had not yet finished setting up payments, that is the worst
 * kind of wrong — it is believable.
 *
 * So the question is asked in one place, and asked properly: money was taken
 * if there was money to take and it was taken.
 */

export type DepositLike = {
  deposit_amount_pence?: number | null;
  deposit_status?: string | null;
};

/** True only where a real amount was really paid. */
export function depositPaid(booking: DepositLike): boolean {
  return (booking.deposit_amount_pence ?? 0) > 0 && booking.deposit_status === "paid";
}

/**
 * Whether this appointment involves a deposit at all.
 *
 * Nothing to pay is a third state, and it is by far the commonest — most
 * entries in most diaries are somebody writing down an appointment. Screens
 * that only know "paid" and "not paid" have to put one of those two next to an
 * entry where neither is true.
 */
export function hasDeposit(booking: DepositLike): boolean {
  return (booking.deposit_amount_pence ?? 0) > 0;
}

/** What a deposit is owed but unpaid, which is the one worth chasing. */
export function depositOutstanding(booking: DepositLike): boolean {
  return hasDeposit(booking) && booking.deposit_status !== "paid";
}
