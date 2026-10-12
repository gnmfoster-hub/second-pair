/**
 * How many appointments an enquiry produced, and what they came to.
 *
 * One rule, in one place, because it was written twice and was wrong twice in
 * exactly the same two ways. The inbox header had its own copy, the weekly
 * report had another, and neither knew about the other.
 *
 * Giles, 12 October: "surely living canvas total should be more?"
 *
 * Both copies counted the CONVERSATION rather than the appointments. An
 * enquiry that produced a consultation and the work, or a standing weekly
 * job, counted once however many appointments came out of it. "Booked in",
 * sat beside a diary, is read as appointments.
 *
 * Both copies also took the money from the enquiry's opening quote and
 * nothing else. The inbox query did not even fetch the booking's own price,
 * so a price agreed afterwards or corrected by the owner could never reach
 * the one figure the screen exists to show. Living Canvas read £320 over
 * thirty days where the bookings themselves came to £160.
 *
 * The fallback to the quote stays. Many bookings never get a price typed on
 * them, and the diary has used "what was agreed, then what was quoted" since
 * a shop that types its own regulars in saw nought every week and quite
 * reasonably stopped believing the number.
 */

export type CountedBooking = {
  cancelled_at: string | null;
  price_pence?: number | null;
};

export type Booked = {
  /** Appointments, not conversations. */
  count: number;
  pence: number;
};

/**
 * @param bookings every booking hanging off one enquiry, cancelled included
 * @param quotePence what that enquiry was quoted, for the ones with no price
 */
export function whatItBooked(
  bookings: CountedBooking[] | null | undefined,
  quotePence: number | null | undefined,
): Booked {
  const live = (bookings ?? []).filter((b) => !b.cancelled_at);

  return {
    count: live.length,
    pence: live.reduce((total, b) => total + (b.price_pence ?? quotePence ?? 0), 0),
  };
}
