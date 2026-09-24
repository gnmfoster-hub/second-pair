/**
 * What the Receptionist is allowed to do on a call, and what it must leave.
 *
 * Giles, asked whether it should be able to book: "can it book but have a
 * confirm setting for deposits and making sure its all ok."
 *
 * Two settings rather than one, because they are two different risks.
 *
 * Hearing is where a phone booking goes wrong, and it is a failure the text
 * assistant has never had: over text the customer types their own name and
 * reads the time back. On a call, a name misheard is a stranger in the diary,
 * and "half ten" heard as "half two" is somebody turning up to a closed shop.
 * So a phone booking can land held — the slot taken, nobody else able to have
 * it, carrying the clock the diary already draws — until a person looks.
 *
 * The deposit is separate. A link cannot be read out, so it goes by text
 * afterwards; and asking for money for an appointment nobody has checked is
 * the wrong order. A business can switch that on once it trusts the rest.
 *
 * Pure. Every decision here is one sentence of policy, and policy is the thing
 * that should be readable without a telephone attached.
 */

export type Settings = {
  /** Whether the business has been sold it at all. */
  allowed: boolean;
  /** Whether this line has it switched on. */
  on: boolean;
  /** Phone bookings wait for a person. Default true. */
  holds: boolean;
  /** It may text a deposit link after the call. Default false. */
  asksDeposit: boolean;
};

export type OnTheCall =
  | { answer: false; because: string }
  | {
      answer: true;
      /** It may put something in the diary. */
      mayBook: boolean;
      /** What state that booking lands in. */
      landsAs: "held" | "booked";
      /** It may text a payment link once the call ends. */
      mayAskDeposit: boolean;
    };

/**
 * The whole policy for one incoming call.
 *
 * Refusing is a real answer and the common one: almost nobody has this, and a
 * line that tries to talk when it has not been sold the ability is worse than
 * one that texts back the way it always did.
 */
export function onTheCall(s: Settings): OnTheCall {
  if (!s.allowed) {
    return { answer: false, because: "not on this plan" };
  }
  if (!s.on) {
    return { answer: false, because: "not switched on for this line" };
  }

  return {
    answer: true,
    mayBook: true,
    /*
     * Held unless the business has said otherwise. The default is the careful
     * one deliberately: a business should not have to switch anything on to be
     * safe, only to be quicker.
     */
    landsAs: s.holds ? "held" : "booked",
    /*
     * And never a deposit on a booking nobody has checked. Asking for money
     * for an appointment that might be wrong is the one thing on this call
     * that reaches into somebody's bank account.
     */
    mayAskDeposit: s.asksDeposit && !s.holds,
  };
}

/**
 * How long a phone booking is held for.
 *
 * Longer than a deposit hold, because this is not waiting on a customer to
 * pay — it is waiting on the business to look, and a business is shut at
 * night. A hold that lapses at two in the morning throws away a real booking
 * nobody was ever going to see in time.
 */
export const HELD_HOURS = 18;

export function heldUntil(now: Date = new Date()): string {
  return new Date(now.getTime() + HELD_HOURS * 3_600_000).toISOString();
}

/**
 * What to say at the end of the call, which has to match what happened.
 *
 * The one sentence a customer will repeat back to somebody later, so it must
 * not promise a confirmed appointment when the diary holds a pending one.
 */
export function whatToSay(result: OnTheCall, firstName: string | null): string {
  if (!result.answer) return "";

  const you = firstName ? `, ${firstName}` : "";

  if (result.landsAs === "held") {
    return `That's gone in${you}. We'll text you to confirm it shortly — if anything's not right, just reply to that.`;
  }
  return result.mayAskDeposit
    ? `You're booked in${you}. I'll text you the details and a link for the deposit.`
    : `You're booked in${you}. I'll text you the details now.`;
}
