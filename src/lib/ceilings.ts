/**
 * How much a business may spend before something stops.
 *
 * Giles: "give limits on texts and calls if required."
 *
 * Two ceilings, and they stop different things on purpose.
 *
 *   Texts   Past it, no more texts. Safe, because the message still goes by
 *           email — the ceiling stops the spend, not the message. See
 *           messageChannels.textsAllowed, which this does not duplicate.
 *
 *   Calls   Past it, we stop ringing the owner's mobile. Nothing else
 *           changes: the call is still answered, the caller is still texted
 *           back within seconds, a message can still be left.
 *
 * That difference is the whole design. Somebody is ringing a business right
 * now, and every way of "stopping" a call is bad — refusing it is the worst
 * thing this product could do to a customer, and answering to say we cannot
 * help is worse, because it sounds like the business saying it.
 *
 * A call has four legs and the dear one by a distance is the outbound leg to a
 * mobile: a whole minute billed at roughly six times the inbound rate, every
 * time anybody rings, answered or not. Stopping that leg stops most of the
 * money and none of the service. The caller's experience past the ceiling is
 * identical to that of every business which has ring-me empty by choice, which
 * is a real setting rather than a broken one.
 */

/** Null or absent means no ceiling, which is every business until somebody sets one. */
export function overCeiling(usedThisMonth: number, cap: number | null | undefined): boolean {
  if (cap === null || cap === undefined) return false;
  return usedThisMonth >= cap;
}

/**
 * Whether this call may ring a mobile.
 *
 * Asked at the moment the call arrives, so a business that has just crossed
 * its ceiling stops paying on the next call rather than at the end of the
 * month.
 */
export function mayForward(callsThisMonth: number, cap: number | null | undefined): boolean {
  return !overCeiling(callsThisMonth, cap);
}

/**
 * What to say about a ceiling on a screen, or nothing when there is none.
 *
 * Both halves matter and the second is the one that stops a support call: what
 * happens when it is reached. A limit whose consequence is unstated is a limit
 * somebody discovers.
 */
export function describeCeiling(
  kind: "texts" | "calls",
  usedThisMonth: number,
  cap: number | null | undefined,
): string | null {
  if (cap === null || cap === undefined) return null;

  const left = Math.max(0, cap - usedThisMonth);
  const past = overCeiling(usedThisMonth, cap);

  if (kind === "texts") {
    return past
      ? `Past the ceiling of ${cap} texts this month, so nothing else is being texted. Emails are unaffected, and reminders that can go by email still go.`
      : `${usedThisMonth} of ${cap} texts this month. Past ${cap}, texting stops until next month and everything that can go by email still goes.`;
  }

  return past
    ? `Past the ceiling of ${cap} calls this month, so calls are no longer ringing a mobile. They are still answered and still texted back.`
    : `${usedThisMonth} of ${cap} calls this month${left <= 5 ? `, ${left} left` : ""}. Past ${cap}, calls stop ringing a mobile — they are still answered and still texted back.`;
}
