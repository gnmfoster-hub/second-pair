/**
 * What a business can actually do about deposits, as opposed to what it has
 * asked for.
 *
 * Switching deposits on is one click in settings; connecting a Stripe account
 * is a form with a bank account on it, and plenty of people do the first and
 * put off the second. Until they finish, the booking code quietly confirms
 * appointments outright and the payment tool refuses to produce a link — both
 * correct — but the assistant was still handed the deposit rule and told to
 * read it out. So it quoted a fifteen pound deposit for a salon that could not
 * take fifteen pence, and on "required" it told people the slot was not held
 * until they paid — of a slot that was already theirs, for a link that was
 * never coming.
 *
 * Every part of the system now asks the same question: not what the business
 * wants, but what would happen if a customer tried to pay.
 */

export type DepositMode = "required" | "optional" | "none";

/** Only the two fields this decision turns on, so it can be tested on its own. */
export type TakesDeposits = {
  deposit_mode: DepositMode;
  stripe_account_id: string | null;
};

/** True once deposits would actually reach the business rather than the platform. */
export const readyForRealMoney = (studio: TakesDeposits) =>
  Boolean(studio.stripe_account_id);

export function effectiveDepositMode(studio: TakesDeposits): DepositMode {
  return readyForRealMoney(studio) ? studio.deposit_mode : "none";
}
