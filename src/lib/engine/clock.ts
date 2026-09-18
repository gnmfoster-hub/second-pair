/**
 * Where a reply's seconds actually go.
 *
 * A reply takes about eight and a half seconds on web chat and the obvious
 * cure — stream it, so words appear as they are written — is a fair amount of
 * work on a path two paying businesses depend on. Worth doing only if the wait
 * is the model writing. If most of it is database round trips, or tools run one
 * after another when they could run together, streaming hides a problem that
 * could have been removed.
 *
 * So: measure first. Four stopwatches, running through a whole turn, reported
 * as a Server-Timing header on the answer. That header is a real browser
 * feature — it shows up in the network tab of anybody's dev tools — so the
 * split stays visible long after today rather than being a number I wrote down
 * once and quoted for a year.
 */

/** The phases worth telling apart. Anything else is rounding. */
export type Phase =
  /** Reading the business: its people, prices, hours, the thread so far. */
  | "setup"
  /** Waiting for the model to write. */
  | "model"
  /** Running what the model asked for: slots, prices, saving the contact. */
  | "tools"
  /** Writing the reply and the conversation back down. */
  | "save";

export type Spent = Partial<Record<Phase, number>> & {
  /** How many times round the model went. A booking turn goes three or four. */
  rounds?: number;
};

/**
 * A stopwatch per phase, added to rather than replaced.
 *
 * Phases interleave — model, tools, model again — so each `time` call adds to
 * that phase's running total instead of setting it. What comes out is "six
 * seconds of this turn was spent waiting for the model", which is the question.
 */
export function stopwatch() {
  const spent: Spent = {};

  return {
    spent,
    /** Runs the work, adds what it took to that phase, hands back its answer. */
    async time<T>(phase: Phase, work: () => Promise<T>): Promise<T> {
      const began = Date.now();
      try {
        return await work();
      } finally {
        spent[phase] = (spent[phase] ?? 0) + (Date.now() - began);
      }
    },
    round() {
      spent.rounds = (spent.rounds ?? 0) + 1;
    },
  };
}

/**
 * The header a browser reads.
 *
 * `Server-Timing: setup;dur=210, model;dur=6100` — dev tools draw it as bars
 * against the request, so anybody looking at a slow reply can see which part
 * was slow without being told what to run.
 */
export function serverTiming(spent: Spent): string {
  return Object.entries(spent)
    .filter(([name]) => name !== "rounds")
    .map(([name, ms]) => `${name};dur=${ms}`)
    .concat(spent.rounds ? [`rounds;dur=${spent.rounds}`] : [])
    .join(", ");
}
