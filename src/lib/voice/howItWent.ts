/**
 * How the last Receptionist calls actually went, in numbers.
 *
 * Giles has now said twice that it is slow to answer, and both times the
 * honest reply was that the lag comes from at least four places — Twilio
 * deciding the caller has stopped speaking, the network, our own lookups, the
 * assistant thinking, and Twilio building the audio. Guessing which to attack
 * is how a day gets spent shaving something that was never the problem.
 *
 * Every turn has logged both halves since the Receptionist was built. Reading
 * them meant the Vercel console, which is a login and a search, and therefore
 * did not happen. This puts the same two numbers on a screen.
 *
 * The split is the whole point. "Two seconds a turn" is a complaint; "two
 * seconds a turn, of which we are one and a half" is a job, and "two seconds a
 * turn, of which we are two hundred milliseconds" is a different job entirely,
 * on Twilio's side, that no amount of work here would fix.
 *
 * Pure, so the arithmetic and the wording can both be tested.
 */

export type CallRun = {
  /** How many times it answered. */
  turns: number;
  /** Milliseconds waiting on the assistant, across the whole call. */
  thinkingMs: number;
  /** How long the conversation ran, in seconds, first turn to last. */
  seconds: number;
  spokenCharacters: number;
};

/**
 * How fast a synthesised voice reads, in characters a second.
 *
 * About 150 words a minute is ordinary speech and a word is about five
 * characters with its space, so fifteen. Near enough: this is used to say
 * whether talking is seconds or tenths of a second, not to bill anybody.
 */
export const CHARACTERS_A_SECOND = 15;

export type HowItWent = {
  calls: number;
  turns: number;
  /** Average wait per turn, in seconds to one decimal. What a caller feels. */
  perTurn: number;
  /** Waiting for the assistant to decide what to say. */
  thinkingPerTurn: number;
  /** The assistant saying it, which is also us and also the caller waiting. */
  talkingPerTurn: number;
  /** Everything left: Twilio's endpointing, the network, the caller themselves. */
  theirsPerTurn: number;
  /** Which of the three is biggest. What the sentence is about. */
  biggest: "thinking" | "talking" | "theirs";
};

export function howItWent(runs: CallRun[]): HowItWent | null {
  const real = runs.filter((r) => r.turns > 0);
  if (!real.length) return null;

  const turns = real.reduce((n, r) => n + r.turns, 0);
  const thinking = real.reduce((n, r) => n + r.thinkingMs, 0);
  const seconds = real.reduce((n, r) => n + r.seconds, 0);
  const characters = real.reduce((n, r) => n + r.spokenCharacters, 0);

  /*
   * Per turn rather than per call, because a caller does not experience a
   * call, they experience each gap after they stop talking. A long call is not
   * a slow one.
   */
  const perTurn = seconds / turns;
  const thinkingPerTurn = thinking / 1000 / turns;

  /*
   * How long it spent talking, which the first version of this did not
   * separate — and that was the flaw that mattered.
   *
   * It split the wait two ways, ours and Twilio's, and put the time the
   * assistant spent speaking into Twilio's half, where it read as "nothing we
   * can do". On the first measured call that was twelve of the fourteen
   * seconds: the reply was three times too long for a telephone, which is
   * entirely ours to fix and is the single thing this screen should have said.
   *
   * A tool that points at the wrong half is worse than no tool, because
   * somebody acts on it.
   */
  const talkingPerTurn = characters / CHARACTERS_A_SECOND / turns;

  /*
   * Whatever is left: Twilio deciding the caller has stopped, the network, and
   * the caller's own thinking time. Never negative — the clocks start in
   * different places and a call ending between them can leave the arithmetic
   * slightly the wrong way round, which must not print as minus three tenths
   * of a second on Twilio.
   */
  const theirsPerTurn = Math.max(0, perTurn - thinkingPerTurn - talkingPerTurn);

  const biggest: HowItWent["biggest"] =
    talkingPerTurn >= thinkingPerTurn && talkingPerTurn >= theirsPerTurn
      ? "talking"
      : thinkingPerTurn >= theirsPerTurn
        ? "thinking"
        : "theirs";

  return {
    calls: real.length,
    turns,
    perTurn: round(perTurn),
    thinkingPerTurn: round(thinkingPerTurn),
    talkingPerTurn: round(talkingPerTurn),
    theirsPerTurn: round(theirsPerTurn),
    biggest,
  };
}

function round(seconds: number): number {
  return Math.round(seconds * 10) / 10;
}

/**
 * The same, as a sentence that says what to do about it.
 *
 * Deliberately says who the work belongs to. A number on a screen that nobody
 * can act on is a number nobody looks at twice.
 */
export function describeHowItWent(went: HowItWent | null): string {
  if (!went) return "No calls have been answered yet, so there is nothing to measure.";

  const s = (n: number) => n.toFixed(1);
  const over = `Over ${went.calls} call${went.calls === 1 ? "" : "s"}, about ${s(went.perTurn)} seconds a turn`;
  const split = `${s(went.thinkingPerTurn)} thinking, ${s(went.talkingPerTurn)} talking, ${s(went.theirsPerTurn)} the telephone`;

  /*
   * Each ending names a job rather than a number. A figure somebody cannot act
   * on is a figure nobody reads twice.
   */
  if (went.biggest === "talking") {
    return `${over} — ${split}. Most of it is the answer itself being long: shortening what it says is the fix, and it is ours.`;
  }
  if (went.biggest === "thinking") {
    return `${over} — ${split}. Most of it is the assistant deciding what to say, which is ours to shorten.`;
  }
  return `${over} — ${split}. Most of it is the telephone deciding you have stopped speaking, which no work at our end would shorten.`;
}
