/**
 * Who has not been back, measured against their own rhythm rather than a rule.
 *
 * Every booking system that does this at all does it with a number of days: no
 * visit in ninety days, send them something. That number is wrong for almost
 * everybody in the same salon at the same time. A colour every five weeks is
 * badly overdue at nine and invisible to a ninety-day rule until she has been
 * gone twice as long as she has ever been. A cut twice a year is flagged as
 * lost every single year while nothing at all is wrong.
 *
 * So the yardstick is the person. How often does she normally come, and how
 * long has it been? The one honest version of this question, and the one a
 * salon owner asks out loud about individuals they can picture.
 *
 * Nothing here touches the database or sends anything. It answers "who" and
 * the screen decides what to do about it, which for now is show them.
 */

export type Visit = {
  contactId: string;
  name: string | null;
  /** When they came. ISO. */
  at: string;
  /** What it was worth, where a price was recorded. */
  pence?: number | null;
};

export type Lapsed = {
  contactId: string;
  name: string | null;
  /** Their last visit, ISO. */
  lastVisit: string;
  daysSince: number;
  /** How often they normally come, in days. */
  usualGapDays: number;
  /** How far past their own rhythm they are, in days. */
  overdueByDays: number;
  /** How many times they have been. */
  visits: number;
  /** What they have been worth, where prices were recorded. */
  pence: number;
  /**
   * Whether the rhythm is theirs or borrowed.
   *
   * Somebody who has been once has no rhythm of their own, and they are the
   * people most worth knowing about — a first visit that never turned into a
   * second is the most expensive kind of customer there is. They are measured
   * against how often this shop's customers generally come, and the screen
   * says which of the two it used, because "she is overdue" and "people like
   * her would normally have been back" are different claims.
   */
  basis: "their own rhythm" | "how often people come here";
};

const DAY = 86_400_000;

/** The middle value, which one long summer away cannot drag about. */
function median(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export type LapsedOptions = {
  /**
   * How far past their own rhythm counts as late. 1.5 means half as long
   * again as they normally leave it.
   */
  factor?: number;
  /**
   * And never less than this many days late, whatever the multiplier says.
   * Without it somebody who comes every week is chased on day eleven, which
   * is how a thoughtful feature becomes a nuisance.
   */
  floorDays?: number;
  /** Contacts with something already in the diary ahead. Never listed. */
  booked?: Iterable<string>;
};

/**
 * Everybody who is past their own usual gap, worst first.
 *
 * Anybody with a future appointment is left out entirely, however long it has
 * been — they are already coming back, and a list that tells a salon to chase
 * somebody who is booked in on Thursday is a list they stop trusting on the
 * first read.
 */
export function whoHasNotBeenBack(
  visits: readonly Visit[],
  now: Date = new Date(),
  options: LapsedOptions = {},
): Lapsed[] {
  const factor = options.factor ?? 1.5;
  const floorDays = options.floorDays ?? 14;
  const booked = new Set(options.booked ?? []);

  // Group, and keep each person's visits in order.
  const byPerson = new Map<string, Visit[]>();
  for (const visit of visits) {
    const at = Date.parse(visit.at);
    if (Number.isNaN(at) || at > now.getTime()) continue;
    const list = byPerson.get(visit.contactId) ?? [];
    list.push(visit);
    byPerson.set(visit.contactId, list);
  }

  /*
   * How often people come here, for the ones who have only been once.
   *
   * Built from everybody who has a rhythm of their own, so a barber and a
   * tattooist get different yardsticks without either being told a number.
   */
  const everyGap: number[] = [];
  const perPerson = new Map<string, { ordered: Visit[]; gaps: number[] }>();

  for (const [contactId, list] of byPerson) {
    const ordered = [...list].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    const gaps: number[] = [];
    for (let i = 1; i < ordered.length; i++) {
      const days = Math.round((Date.parse(ordered[i].at) - Date.parse(ordered[i - 1].at)) / DAY);
      // Two appointments the same day are one visit as far as rhythm goes.
      if (days > 0) gaps.push(days);
    }
    everyGap.push(...gaps);
    perPerson.set(contactId, { ordered, gaps });
  }

  const shopGap = median(everyGap);

  const out: Lapsed[] = [];

  for (const [contactId, { ordered, gaps }] of perPerson) {
    if (booked.has(contactId)) continue;

    const last = ordered[ordered.length - 1];
    const daysSince = Math.round((now.getTime() - Date.parse(last.at)) / DAY);

    const own = gaps.length > 0;
    const usualGapDays = own ? median(gaps) : shopGap;

    /*
     * No yardstick at all, which is a business whose customers have each been
     * exactly once. There is nothing to be late against, and guessing a number
     * here is the ninety-day rule wearing a different hat.
     */
    if (usualGapDays <= 0) continue;

    const late = daysSince - usualGapDays;
    if (daysSince < usualGapDays * factor || late < floorDays) continue;

    out.push({
      contactId,
      name: last.name,
      lastVisit: last.at,
      daysSince,
      usualGapDays,
      overdueByDays: late,
      visits: ordered.length,
      pence: ordered.reduce((sum, v) => sum + (v.pence ?? 0), 0),
      basis: own ? "their own rhythm" : "how often people come here",
    });
  }

  /*
   * Worst first, and "worst" is how far past their own rhythm rather than how
   * long in days — otherwise the list is simply everybody who came once in
   * 2023, and the regular who has quietly stopped coming, which is the one
   * worth a phone call, is on page two.
   */
  return out.sort((a, b) => b.overdueByDays / b.usualGapDays - a.overdueByDays / a.usualGapDays);
}
