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

/** Only the fields this decision turns on, so it can be tested on its own. */
export type TakesDeposits = {
  deposit_mode: DepositMode;
  stripe_account_id: string | null;
  payment_model?: "business" | "people" | null;
  payment_fallback?: boolean | null;
};

/** A person, as far as where their money goes. */
export type DepositPerson = {
  stripe_account_id?: string | null;
  takes_deposits?: boolean | null;
};

/**
 * True once a deposit would actually reach somebody's own account.
 *
 * On a business paid as one, that is the business's account. On a business
 * where each person is paid into their own, it is that person's — or the
 * business's, if the owner chose to catch payments for people without one.
 * Asked about nobody in particular, it is whether anybody at all could be paid.
 *
 * This used to look only at the business's account, so a salon of chair
 * renters, each with Stripe connected and the shop with none, took no
 * deposits at all — and one with the shop connected sent every renter's
 * deposit to the owner.
 */
export function readyForRealMoney(
  studio: TakesDeposits,
  person?: DepositPerson | null,
  people: DepositPerson[] = [],
): boolean {
  const business = Boolean(studio.stripe_account_id);
  if (studio.payment_model !== "people") return business;

  const fallback = studio.payment_fallback === true && business;
  const own = (p: DepositPerson) => p.takes_deposits !== false && Boolean(p.stripe_account_id);

  if (person) return (person.takes_deposits !== false && fallback) || own(person);
  return fallback || people.some(own);
}

export function effectiveDepositMode(
  studio: TakesDeposits,
  people: DepositPerson[] = [],
): DepositMode {
  return readyForRealMoney(studio, null, people) ? studio.deposit_mode : "none";
}
