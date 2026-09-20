/**
 * What the numbers themselves cost us, standing still.
 *
 * Every other cost in this product happens because somebody did something: a
 * text was sent, a call was answered, a reply was written. A number costs the
 * same whether it is used or not, from the day it is bought until the day it
 * is handed back, and Giles is giving them away inside the subscription — so
 * it is his margin rather than something a business is billed for.
 *
 * Which makes it the one cost that can quietly grow without anybody doing
 * anything. Ten businesses with two numbers each is twenty rentals a month and
 * nothing anywhere counted them.
 *
 * Published, not invoiced, exactly as CALL_RATES is: this is the price off
 * Twilio's page for a UK mobile number, and the real bill has tax and possibly
 * a different rate. Anything shown from it says it is an estimate, and should
 * keep saying so until an invoice replaces it.
 */
export const NUMBER_MONTHLY_PENCE = 115;

export type SuppliedNumber = {
  /** The line itself. */
  externalId: string | null;
  /** Whose it is: null for the business's, a name for one person's. */
  forWho: string | null;
  /** Still in service. A number switched off still costs until it is given back. */
  active: boolean;
  /** When it went on, as far as we know. */
  since: string | null;
};

export type Supply = {
  /** How many are in service. */
  live: number;
  /** How many are recorded but switched off, which still cost until handed back. */
  off: number;
  /** What the live ones cost a month, in pence. */
  monthlyPence: number;
};

/**
 * What we are supplying, and what it costs us a month.
 *
 * Counts the switched-off ones separately rather than ignoring them. A number
 * that has been turned off in the product has not been handed back to Twilio,
 * and the bill does not know the difference — so counting only the live ones
 * would understate the cost in exactly the situation worth noticing, which is
 * somebody stopping using something we are still paying for.
 */
export function supplyOf(numbers: SuppliedNumber[]): Supply {
  const live = numbers.filter((n) => n.active).length;
  const off = numbers.length - live;
  return { live, off, monthlyPence: live * NUMBER_MONTHLY_PENCE };
}
