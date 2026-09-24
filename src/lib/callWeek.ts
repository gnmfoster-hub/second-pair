/**
 * What the telephone did this week, for the business paying for it.
 *
 * Found by auditing for columns the product stores and never reads. Calls are
 * recorded in full — who rang, how long it rang, whether it was forwarded,
 * whether anybody answered — and the only screen that has ever read them is
 * ours, to work out what they cost us. The business paying for the telephone
 * cannot see that it did anything.
 *
 * A missed call does surface, eventually, as the text back arriving in their
 * inbox. An answered one leaves no trace at all: somebody's phone rang, they
 * picked it up, and the product that made that happen never mentions it. So
 * "is the phone thing doing anything?" has no answer on any screen.
 *
 * Pure. The counting is trivial; the part worth testing is which calls belong
 * in which bucket, because "answered" and "forwarded" are different questions
 * and the difference decides whether a business thinks it is working.
 */

export type CallRow = {
  /** Whether we rang their mobile at all. */
  forwarded: boolean;
  /** Whether a person picked it up. */
  answered: boolean;
  /** How long their phone rang before it stopped. */
  rangSeconds: number;
};

export type CallWeek = {
  calls: number;
  /** Somebody picked up. */
  answered: number;
  /**
   * Nobody picked up, so the caller was texted back.
   *
   * The product's actual job on the telephone, and the number worth showing
   * bigger than the others.
   */
  textedBack: number;
  /** Rang nowhere, because there is no mobile set. Texted back immediately. */
  straightToText: number;
};

export function callWeek(rows: CallRow[]): CallWeek {
  const answered = rows.filter((r) => r.answered).length;

  /*
   * Not forwarded means there was nowhere to ring — ring-me is empty, by
   * choice or because nobody has set it. Those callers were texted straight
   * away, which is a different experience to a phone ringing out, and an owner
   * reading "8 rang out" when their phone never rang would rightly think the
   * product was broken.
   */
  const straightToText = rows.filter((r) => !r.answered && !r.forwarded).length;

  return {
    calls: rows.length,
    answered,
    textedBack: rows.length - answered,
    straightToText,
  };
}

/**
 * The line under the figure, or null when there were no calls.
 *
 * Says what happened to the ones nobody picked up, because that is the half
 * the business is paying for and the half it cannot otherwise see.
 */
export function callLine(week: CallWeek): string | null {
  if (week.calls === 0) return null;

  if (week.textedBack === 0) return "Every one answered in person.";

  const missed = week.textedBack === 1 ? "1 nobody picked up" : `${week.textedBack} nobody picked up`;
  const rang = week.textedBack - week.straightToText;

  if (week.straightToText === week.textedBack) {
    return `${missed}, texted back straight away.`;
  }
  if (week.straightToText === 0) {
    return `${missed}, rang out and got a text back.`;
  }
  return `${missed} — ${rang} rang out, ${week.straightToText} texted straight away.`;
}
