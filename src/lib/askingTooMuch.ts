/**
 * How much one caller may ask for.
 *
 * The chat endpoint is open to the internet by design — it is the widget on a
 * business's website, and a customer has no account. What guarded it was a
 * one-and-a-half second gap keyed on the session, and the session is a string
 * the caller makes up: send a new one each time and there was no limit at all.
 * Every message costs the business real money at the model, and lands in the
 * inbox somebody has to read.
 *
 * So the budget is per address as well as per session. It is held in memory,
 * which means it resets on deploy and is not shared between instances — that
 * is a real weakness and worth saying plainly rather than implying otherwise.
 * It stops somebody running a script from a laptop; it would not stop somebody
 * determined and distributed, and that wants a shared store when the traffic
 * justifies one.
 */

export type Budget = {
  /** Smallest gap between two messages on the same conversation. */
  gapMs: number;
  /** How many messages one address may send in the window. */
  perAddress: number;
  windowMs: number;
};

export const ORDINARY: Budget = {
  gapMs: 1500,
  /*
   * Forty messages in ten minutes.
   *
   * A real customer booking an appointment sends five or six. Somebody
   * indecisive about a tattoo might send twenty. Forty is past anything a
   * person does and still far below what a script would.
   */
  perAddress: 40,
  windowMs: 10 * 60 * 1000,
};

type Seen = { last: number; times: number[] };

export class Limiter {
  private readonly seen = new Map<string, Seen>();
  private readonly budget: Budget;

  constructor(budget: Budget = ORDINARY) {
    this.budget = budget;
  }

  /**
   * Whether this one should be refused, and why.
   *
   * The address is taken from the request rather than the body, so it is not
   * something the caller can simply change like the session is.
   */
  tooMuch(session: string, address: string, now = Date.now()): string | null {
    // The conversation's own pace, which catches a stuck or looping client.
    const bySession = this.seen.get(`s:${session}`);
    if (bySession && now - bySession.last < this.budget.gapMs) return "too fast";
    this.seen.set(`s:${session}`, { last: now, times: [] });

    /*
     * Nothing to key on. An address is normally present behind a proxy; when
     * it is not, the session gap above is all there is, and refusing the
     * message outright would turn a header problem into a broken widget.
     */
    if (!address) return null;

    const key = `a:${address}`;
    const entry = this.seen.get(key) ?? { last: 0, times: [] };
    const since = now - this.budget.windowMs;
    const recent = entry.times.filter((t) => t > since);

    if (recent.length >= this.budget.perAddress) {
      this.seen.set(key, { last: now, times: recent });
      return "too many";
    }

    recent.push(now);
    this.seen.set(key, { last: now, times: recent });

    // Bounded, so a long-running instance cannot grow this without limit.
    if (this.seen.size > 10_000) this.forget(since);

    return null;
  }

  private forget(before: number) {
    for (const [key, entry] of this.seen) {
      const alive = entry.times.filter((t) => t > before);
      if (!alive.length && entry.last < before) this.seen.delete(key);
      else this.seen.set(key, { last: entry.last, times: alive });
    }
  }
}
