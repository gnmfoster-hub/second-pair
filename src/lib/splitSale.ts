/**
 * What a payment contributes to the shelf, and what it contributes to what was
 * taken at the desk.
 *
 * Two questions a week's figures ask about the same row, and they are not the
 * same question. A counter sale is entirely shelf. A bill is the work plus
 * whatever came off the shelf with it, and only the second half belongs in the
 * counter total — the work is already counted in what the diary was worth.
 *
 * Getting it wrong is not a rounding error. Counting a bill's gross as a sale
 * shows a £95 colour twice, once as what the appointment was worth and once as
 * something sold, and makes a week look like it took nearly double what it did
 * — on the one screen somebody reads to find out.
 *
 * Its own file with no aliased imports, so the arithmetic can be tested
 * without a database. It is the sort that is checked with a calculator by
 * somebody who has noticed their figures are wrong.
 */

export type PaymentForSplit = {
  /** "product" is a counter sale; anything else is a bill against a booking. */
  kind: string;
  grossPence: number | null;
  /**
   * The lines of it that came off the price list.
   *
   * The discriminator, and the only one there is: a shelf item always points
   * at a row on the price list and the work on a bill never does. Empty for a
   * counter sale, whose whole gross is shelf by definition.
   */
  shelfLines: { quantity: number; unitPence: number }[];
};

export type Split = {
  /** Goes in the counter total. */
  shelfPence: number;
  /** Goes in "taken at the desk", against what was booked. */
  takenPence: number;
};

export function splitSale(payment: PaymentForSplit): Split {
  const gross = payment.grossPence ?? 0;

  if (payment.kind === "product") {
    /*
     * Sold over the counter, with no appointment behind it. All shelf, and
     * nothing to do with the diary — so it is not money "taken at the desk"
     * against anything booked.
     */
    return { shelfPence: gross, takenPence: 0 };
  }

  const shelf = payment.shelfLines.reduce((sum, l) => sum + l.quantity * l.unitPence, 0);

  /*
   * A bill. Its gross is everything the customer handed over, which is the
   * honest answer to "what came in"; its shelf lines are the part that is not
   * the work.
   *
   * Never more than the gross. A bill whose lines were written and whose total
   * was later corrected downwards would otherwise report more sold off the
   * shelf than was paid in all — a number that cannot be true and would be
   * believed.
   */
  return { shelfPence: Math.min(shelf, gross), takenPence: gross };
}
