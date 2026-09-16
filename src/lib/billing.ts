/**
 * What a business owes for a month, and what that month cost us.
 *
 * Kept pure and alone in its file, because it is the arithmetic behind an
 * invoice: it has to be readable by somebody checking a figure a customer has
 * queried, and testable without a database anywhere near it.
 *
 * Everything is pence. Nothing here uses a floating point number for money.
 */

export type Plan = {
  /** What they pay every month whatever they use. */
  planPence: number;
  /** Texts the monthly price covers. Null means unlimited. */
  textsIncluded: number | null;
  /** What each text past the bundle costs them. */
  overagePence: number;
};

export type Used = {
  /** Texts we sent on their behalf: replies and reminders. */
  textsOut: number;
  /** Texts their customers sent in. Costs us money, and is not billed on. */
  textsIn: number;
  emailsOut: number;
  /** What the model charged, in millionths of a pound. */
  modelMicros: number;
};

export type Line = { what: string; detail: string; pence: number };

/** What the standard plan covers when nobody has said otherwise. */
export const DEFAULT_PLAN: Plan = { planPence: 3900, textsIncluded: 300, overagePence: 8 };

/**
 * The bill.
 *
 * A bundle is counted on texts we send, not on texts their customers send in.
 * Charging somebody for a message they received is the sort of line that
 * turns a renewal into an argument, and inbound is a fifth of the price
 * anyway.
 */
export function billFor(plan: Plan, used: Used): { lines: Line[]; totalPence: number } {
  const lines: Line[] = [
    {
      what: "Monthly plan",
      detail:
        plan.textsIncluded == null
          ? "texts included"
          : `${plan.textsIncluded.toLocaleString()} texts included`,
      pence: plan.planPence,
    },
  ];

  const over = plan.textsIncluded == null ? 0 : Math.max(0, used.textsOut - plan.textsIncluded);
  if (over > 0) {
    lines.push({
      what: "Extra texts",
      detail: `${over.toLocaleString()} past the bundle at ${plan.overagePence}p`,
      pence: over * plan.overagePence,
    });
  }

  return { lines, totalPence: lines.reduce((t, l) => t + l.pence, 0) };
}

/** How many texts are left before they start paying by the message. */
export function textsLeft(plan: Plan, used: Used): number | null {
  if (plan.textsIncluded == null) return null;
  return Math.max(0, plan.textsIncluded - used.textsOut);
}

/** Rates we are charged. Pence, except the model, which is measured. */
export type Rates = {
  smsOutPence: number;
  smsInPence: number;
  emailPence: number;
  numberPence: number;
};

export const RATES: Rates = {
  smsOutPence: 4,
  smsInPence: 0.75,
  emailPence: 0.03,
  numberPence: 100,
};

/**
 * What the month cost us to serve them — everything that scales with one
 * business, and nothing that does not. The shared bill is company-wide and is
 * accounted for separately, because dividing it by however many businesses
 * there happen to be makes every business's margin move when a new one signs
 * up, which is nonsense.
 */
export function costOfServing(used: Used, rates: Rates = RATES): number {
  return Math.round(
    used.modelMicros / 10_000 +
      used.textsOut * rates.smsOutPence +
      used.textsIn * rates.smsInPence +
      used.emailsOut * rates.emailPence +
      rates.numberPence,
  );
}

/** Taken, minus what it cost. Negative is a business we are paying to keep. */
export function marginOf(billedPence: number, costPence: number): { pence: number; percent: number } {
  const pence = billedPence - costPence;
  return { pence, percent: billedPence > 0 ? Math.round((pence / billedPence) * 100) : 0 };
}

/**
 * The month a date falls in, as the first of it.
 *
 * Every usage row is filed under this, so "September" means one thing
 * everywhere and a bill can be rebuilt months later without re-reading
 * messages that data retention has since thrown away.
 */
export function monthOf(date: Date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/** The month before that one, for "last month's bill". */
export function monthBefore(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12-01` : `${y}-${String(m - 1).padStart(2, "0")}-01`;
}

/** "September 2026", for a heading. */
export function monthName(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
