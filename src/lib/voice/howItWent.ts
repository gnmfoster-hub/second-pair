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

export type HowItWent = {
  calls: number;
  turns: number;
  /** Average wait per turn, in seconds to one decimal. What a caller feels. */
  perTurn: number;
  /** Our share of that wait. */
  oursPerTurn: number;
  /** Everything that is not us: Twilio, the network, the line. */
  theirsPerTurn: number;
  /** Nought to one hundred, rounded, so the sentence can name a culprit. */
  ourShare: number;
};

export function howItWent(runs: CallRun[]): HowItWent | null {
  const real = runs.filter((r) => r.turns > 0);
  if (!real.length) return null;

  const turns = real.reduce((n, r) => n + r.turns, 0);
  const thinking = real.reduce((n, r) => n + r.thinkingMs, 0);
  const seconds = real.reduce((n, r) => n + r.seconds, 0);

  /*
   * Per turn rather than per call, because a caller does not experience a
   * call, they experience each gap after they stop talking. A long call is not
   * a slow one.
   */
  const perTurn = seconds / turns;
  const oursPerTurn = thinking / 1000 / turns;

  /*
   * Never negative, and never more than the whole. The two clocks are started
   * in different places and a call that ends between them can leave the
   * arithmetic slightly the wrong way round — which is a rounding artefact and
   * must not print as "minus three tenths of a second on Twilio".
   */
  const theirsPerTurn = Math.max(0, perTurn - oursPerTurn);

  return {
    calls: real.length,
    turns,
    perTurn: round(perTurn),
    oursPerTurn: round(oursPerTurn),
    theirsPerTurn: round(theirsPerTurn),
    ourShare: perTurn > 0 ? Math.round((Math.min(oursPerTurn, perTurn) / perTurn) * 100) : 0,
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

  const over = `Over ${went.calls} call${went.calls === 1 ? "" : "s"}`;
  const wait = `about ${went.perTurn.toFixed(1)} seconds between somebody finishing and the answer starting`;

  if (went.ourShare >= 60) {
    return `${over}, ${wait} — and ${went.oursPerTurn.toFixed(1)} of that is our assistant thinking. That is the half worth attacking.`;
  }
  if (went.ourShare <= 30) {
    return `${over}, ${wait}, and only ${went.oursPerTurn.toFixed(1)} of it is ours. The rest is the telephone deciding you have stopped speaking and building the audio, which no work at our end would shorten.`;
  }
  return `${over}, ${wait} — ${went.oursPerTurn.toFixed(1)} ours and ${went.theirsPerTurn.toFixed(1)} the telephone's. Neither half is obviously the problem.`;
}
