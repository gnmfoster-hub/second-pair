/**
 * How a booking's messages went, in one line.
 *
 * Written on 1 October, when the customer record started folding a booking's
 * messages away. The whole point of folding them is that somebody can decide
 * not to open them, and they can only decide that if the closed line tells them
 * whether anything needs looking at. "4 messages" and nothing else is just a
 * thing to click on every time.
 *
 * It lives here rather than beside the component so it can be tested, which it
 * needs to be: it is counting, the counts have to add up to the number shown
 * beside them, and a row can carry two facts at once.
 */

export type HowItWent = {
  /** Whether it was sent, and when, which is all this needs. */
  sent_at: string | null;
  /** sent, pending, failed or skipped. */
  status: string;
};

export type Went = {
  /** The whole line, ready to print. */
  label: string;
  /** Whether one of them did not reach somebody. Shown in red, and unfolded. */
  bad: boolean;
};

/**
 * The buckets are disjoint and taken in this order on purpose.
 *
 * Anything with a sent_at is sent, whatever else the row says — a failure
 * recorded against a send that succeeded on the second attempt is a message
 * the customer has. Then failed, then skipped, and whatever is left is still to
 * go. Taken in any other order the numbers stop adding up to the count beside
 * them, which is the one thing a summary line must never do.
 *
 * Skipped is named "not sent" rather than "skipped" because it is usually a
 * decision somebody made — a cancelled appointment, or somebody who texted
 * STOP — and the word for a decision should not sound like a fault. The same
 * distinction cost us a red "Reminder failed" on every ordinary skip in
 * September.
 */
export function howTheyWent(list: HowItWent[]): Went {
  const sent = list.filter((r) => Boolean(r.sent_at)).length;
  const rest = list.filter((r) => !r.sent_at);
  const failed = rest.filter((r) => r.status === "failed").length;
  const skipped = rest.filter((r) => r.status === "skipped").length;
  const due = rest.length - failed - skipped;

  const parts: string[] = [];
  if (sent) parts.push(`${sent} sent`);
  if (failed) parts.push(`${failed} failed`);
  if (skipped) parts.push(`${skipped} not sent`);
  if (due) parts.push(`${due} still to go`);

  const many = list.length === 1 ? "1 message" : `${list.length} messages`;

  /* No parts at all means no messages, and the caller does not draw the line. */
  return {
    label: parts.length ? `${many} · ${parts.join(", ")}` : many,
    bad: failed > 0,
  };
}
