/**
 * Which of this week the assistant won, and which somebody typed in.
 *
 * Giles, on the diary looking like everybody else's: "assistant vs human".
 *
 * Every other system's diary is a record of what a person typed, so the
 * question does not exist for them. Here it is the whole question — it is what
 * the business is paying for, and until now the screen they look at twenty
 * times a day could not answer it. `source` has been on every booking since
 * the diary could be written into by hand, and it was read only to keep
 * somebody's dentist appointment out of the takings.
 *
 * Money rather than a count, because a count flatters. Nine regulars typed in
 * and one balayage the assistant won is nine-to-one by count and about even by
 * money, and the money is the one that decides whether this is worth paying
 * for.
 */

export type Booked = {
  source: string;
  /** What it is worth: agreed price first, then what was quoted. */
  pence: number;
  /** Time off and somebody's own calendar are not work and never count. */
  countsAsWork: boolean;
};

export type Split = {
  assistant: { jobs: number; pence: number };
  byHand: { jobs: number; pence: number };
  /** Its share of the money, rounded, or null when there is no money in view. */
  sharePercent: number | null;
};

export function whoBookedIt(entries: Booked[]): Split {
  const work = entries.filter((e) => e.countsAsWork);

  const assistant = { jobs: 0, pence: 0 };
  const byHand = { jobs: 0, pence: 0 };

  for (const e of work) {
    const side = e.source === "assistant" ? assistant : byHand;
    side.jobs++;
    side.pence += e.pence;
  }

  const total = assistant.pence + byHand.pence;

  return {
    assistant,
    byHand,
    /*
     * Null rather than nought when nothing in view is worth anything. "0%" on
     * an empty week is a judgement about the assistant; no figure at all is
     * the truth, which is that there is nothing to divide.
     */
    sharePercent: total > 0 ? Math.round((assistant.pence / total) * 100) : null,
  };
}

/**
 * The line for the figures along the top of the diary, or null.
 *
 * Silent where the assistant has won nothing in view, deliberately. The worth
 * figure had exactly this problem once and the comment above it still says so:
 * a shop that types its own regulars in saw £0 every week and quite reasonably
 * stopped believing the number. A nought that appears every Monday is not
 * information, it is an accusation.
 */
export function assistantWon(split: Split): { jobs: number; pence: number } | null {
  return split.assistant.jobs > 0 ? split.assistant : null;
}
