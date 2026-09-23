/**
 * Two telephone add-ons, kept apart so each can be sold on its own.
 *
 * Giles: "the calls option in settings — is that for the answering message and
 * text back, or the receptionist. They need to be two separate things, both
 * scoped with pricing, so I can sell them as an add on."
 *
 * They were one thing wearing two names, so this is the place that says which
 * is which and counts what there is to charge for.
 *
 *   Voicemail response  A call comes in, their own mobile rings first, and if
 *                       nobody picks up the caller is texted back — or leaves
 *                       a message, which is written down, answered by text
 *                       with a real time or price, and the recording deleted
 *                       once read. Nobody talks to a machine. Sold as the
 *                       "voice" channel, priced by the call.
 *
 *   Receptionist        It picks up and holds the conversation. Sold per
 *                       instance: the business's own line may have one, and so
 *                       may each person. Priced by the instance, because an
 *                       instance costs whether it is rung or not.
 *
 * Pure and separate from the database on purpose: the counting is the part
 * with money in it, and money is the part worth being able to test.
 */

/** A line that can hold a Receptionist: the business's own, or one person's. */
export type Instance = {
  /** Who it answers as. The business's own line has no person. */
  who: string | null;
  on: boolean;
};

/**
 * What the two add-ons are called, in one place.
 *
 * Giles named them: the talking one is the Receptionist, the answerphone is
 * the voicemail response. Both were being called "voice" in places a business
 * reads, which is a word for neither of them and the reason he had to ask
 * which one the calls screen was about.
 */
export const RECEPTIONIST = "Receptionist";
export const VOICEMAIL_RESPONSE = "Voicemail response";

/**
 * Whether a switch may be flipped at all.
 *
 * Entitlement and instance are two questions with two different people
 * answering them: we sell it, they switch it on. Checked in the rules and not
 * only on the screen, because a value already in the database from before an
 * add-on lapsed must not keep costing.
 */
export function mayTurnOn(allowed: unknown): boolean {
  return allowed === true;
}

/**
 * Every instance that is actually on, and therefore chargeable.
 *
 * Nothing is chargeable where the business is not entitled, however many
 * switches are set — that is what makes stopping the add-on a single change
 * rather than a hunt through every person in the diary.
 */
export function liveInstances(allowed: unknown, instances: Instance[]): Instance[] {
  if (!mayTurnOn(allowed)) return [];
  return instances.filter((i) => i.on);
}

/**
 * How many there are to charge for.
 *
 * Counted from the switches rather than from calls, because that is what is
 * being sold. A Receptionist on a line nobody rang in February still cost a
 * month's rent, and billing it on usage would make a quiet month free.
 */
export function chargeableCount(allowed: unknown, instances: Instance[]): number {
  return liveInstances(allowed, instances).length;
}

/**
 * Said in a line, for a screen.
 *
 * "Nobody" rather than "0 people" where it is off everywhere: a nought is a
 * number somebody has to read twice to be sure it is not a fault.
 */
export function describeInstances(allowed: unknown, instances: Instance[]): string {
  if (!mayTurnOn(allowed)) return "Not on this plan.";

  const live = liveInstances(allowed, instances);
  if (live.length === 0) return "Nobody has one switched on.";

  const business = live.some((i) => i.who === null);
  const people = live.filter((i) => i.who !== null).map((i) => i.who as string);

  const parts: string[] = [];
  if (business) parts.push("the business’s own line");
  if (people.length) parts.push(people.join(", "));

  return `On for ${parts.join(" and ")}.`;
}
