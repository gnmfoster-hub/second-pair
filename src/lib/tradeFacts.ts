/**
 * The handful of things a trade keeps about a customer that nothing else can.
 *
 * A groomer needs a vaccination expiry, and needs it to stop a booking when it
 * has run out. A garage needs an MOT date, and needs to be first to mention it
 * — the DVSA already texts every motorist a month before, free, so a garage's
 * reminder is worthless unless it lands earlier and carries a slot. A driving
 * instructor needs a theory pass date, because it expires after two years and
 * a pupil who misses that has to sit it again.
 *
 * This is the thing every vertical product has and every general one does not.
 * We already ask these questions in conversation — the packs have asked a
 * groomer about the breed since August — but the answers landed in a paragraph
 * of free text, where nothing can act on them. A date nobody can compare is not
 * a date, it is a sentence.
 *
 * So: a small, typed set per trade, defined in the pack, stored against the
 * customer. Pure and alone in its file, because the rules about what blocks a
 * booking have to be readable by somebody who is about to be refused one.
 */

export type FactType = "date" | "text" | "number" | "yesno";

export type TradeFact = {
  /** Stored under this. Stable — renaming one loses everybody's answers. */
  key: string;
  /** What it is called on screen. */
  label: string;
  type: FactType;
  /** How the assistant asks for it, in this trade's own words. */
  ask?: string;
  /**
   * Whether an appointment can be made without it.
   *
   * "missing" — no answer at all stops the booking.
   * "expired" — a date in the past stops it, and no answer does too, because
   * an unknown vaccination is exactly as risky as an expired one.
   */
  blocks?: "missing" | "expired";
  /** Say something this many days before the date. Dates only. */
  remindBefore?: number;
  /** Worth seeing on the appointment itself, not only on the record. */
  onAppointment?: boolean;
};

/** What a customer's answers look like once stored. */
export type FactValues = Record<string, string | number | boolean | null>;

/**
 * A date, read the way somebody types it.
 *
 * Accepts what a person actually writes to an assistant — "3 March 2027",
 * "03/03/2027", "2027-03-03" — and returns the one form everything else uses.
 * Day first on an ambiguous slash date, because this is the United Kingdom.
 */
export function readDate(raw: unknown): string | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (iso) return text;

  const slashed = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(text);
  if (slashed) {
    const day = Number(slashed[1]);
    const month = Number(slashed[2]);
    const year = Number(slashed[3].length === 2 ? `20${slashed[3]}` : slashed[3]);
    if (month > 12) return null;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString().slice(0, 10);
}

/** Yes, no, or we do not know — never a guess. */
export function readYesNo(raw: unknown): boolean | null {
  const text = String(raw ?? "").trim().toLowerCase();
  if (!text) return null;
  if (["yes", "y", "true", "yeah", "yep", "aye"].includes(text)) return true;
  if (["no", "n", "false", "nope", "not yet"].includes(text)) return false;
  return null;
}

/** One answer, cleaned up for storage, or null if it was not usable. */
export function readFact(fact: TradeFact, raw: unknown): string | number | boolean | null {
  if (raw == null || String(raw).trim() === "") return null;

  switch (fact.type) {
    case "date":
      return readDate(raw);
    case "yesno":
      return readYesNo(raw);
    case "number": {
      const n = Number(String(raw).replace(/[^\d.-]/g, ""));
      return Number.isFinite(n) ? n : null;
    }
    default:
      return String(raw).trim().slice(0, 200);
  }
}

/**
 * Why this appointment cannot be made yet.
 *
 * Returns a sentence per problem, written for the assistant to pass on rather
 * than for a log. Empty means nothing is in the way — which is the answer for
 * almost every trade, because almost no trade defines a blocking fact.
 */
export function whatBlocks(
  facts: TradeFact[],
  values: FactValues,
  now: Date = new Date(),
): string[] {
  const problems: string[] = [];
  const today = now.toISOString().slice(0, 10);

  for (const fact of facts) {
    if (!fact.blocks) continue;

    const value = values?.[fact.key];
    const missing = value == null || String(value).trim() === "";

    if (missing) {
      problems.push(`${fact.label} is not recorded`);
      continue;
    }

    /*
     * An expired date and a missing one are the same risk, and both stop the
     * booking. The wording is different because the fix is different: one
     * needs asking for, the other needs renewing.
     */
    if (fact.blocks === "expired" && fact.type === "date" && String(value) < today) {
      problems.push(`${fact.label} ran out on ${String(value)}`);
    }
  }

  return problems;
}

/** What the assistant still has to ask about, in the trade's own words. */
export function stillToAsk(facts: TradeFact[], values: FactValues): string[] {
  return facts
    .filter((f) => f.ask && (values?.[f.key] == null || String(values[f.key]).trim() === ""))
    .map((f) => f.ask as string);
}

/**
 * Dates coming up, for the sweep that gets in before the DVSA does.
 *
 * `within` is a window in days rather than an exact match, so a job that fails
 * to run one night catches up the next rather than missing somebody's MOT for
 * a year.
 */
export function dueSoon(
  facts: TradeFact[],
  values: FactValues,
  now: Date = new Date(),
  within = 3,
): { fact: TradeFact; on: string; daysAway: number }[] {
  const out: { fact: TradeFact; on: string; daysAway: number }[] = [];

  for (const fact of facts) {
    if (!fact.remindBefore || fact.type !== "date") continue;

    const on = values?.[fact.key];
    if (on == null) continue;

    const when = Date.parse(`${String(on)}T09:00:00Z`);
    if (!Number.isFinite(when)) continue;

    const daysAway = Math.round((when - now.getTime()) / 86_400_000);
    if (daysAway <= fact.remindBefore && daysAway > fact.remindBefore - within) {
      out.push({ fact, on: String(on), daysAway });
    }
  }

  return out;
}

/** "Vaccination expires 3 March 2027", for a screen or a message. */
export function describeFact(fact: TradeFact, value: unknown): string | null {
  if (value == null || String(value).trim() === "") return null;

  if (fact.type === "date") {
    const when = new Date(`${String(value)}T09:00:00Z`);
    if (!Number.isFinite(when.getTime())) return `${fact.label}: ${String(value)}`;
    return `${fact.label}: ${when.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}`;
  }

  if (fact.type === "yesno") return `${fact.label}: ${value === true ? "yes" : "no"}`;

  return `${fact.label}: ${String(value)}`;
}
