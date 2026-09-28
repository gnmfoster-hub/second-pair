/**
 * What can go in the diary.
 *
 * The owner runs their whole week from this, not just client work — so the
 * categories cover the day, and each one carries whether it takes time. A
 * supplier order is a note; a dentist appointment is an hour gone.
 */

export type CategoryKey =
  | "appointment"
  | "consultation"
  | "meeting"
  | "admin"
  | "supplies"
  | "break"
  | "holiday"
  | "personal"
  | "training"
  | "other";

export type CategoryDef = {
  key: CategoryKey;
  label: string;
  /** Does it take the time, or just sit in the day as a note? */
  blocks: boolean;
  /** Colour token; the grid reads by colour before it reads by text. */
  hue: string;
  hint?: string;
};

export const CATEGORIES: CategoryDef[] = [
  {
    key: "appointment",
    label: "Appointment",
    blocks: true,
    hue: "var(--cal-client)",
    hint: "A client, booked in.",
  },
  {
    key: "consultation",
    label: "Consultation",
    blocks: true,
    hue: "var(--cal-client)",
    hint: "A sit-down before the work.",
  },
  {
    key: "meeting",
    label: "Meeting",
    blocks: true,
    hue: "var(--cal-work)",
    hint: "Reps, accountant, anyone else.",
  },
  {
    key: "admin",
    label: "Admin",
    blocks: true,
    hue: "var(--cal-work)",
    hint: "Paperwork, designs, ordering.",
  },
  {
    key: "training",
    label: "Training",
    blocks: true,
    hue: "var(--cal-work)",
  },
  {
    key: "break",
    label: "Break",
    blocks: true,
    hue: "var(--cal-off)",
    hint: "Lunch, or a gap you want kept.",
  },
  {
    key: "holiday",
    label: "Holiday",
    blocks: true,
    hue: "var(--cal-off)",
    hint: "Days off. Nothing gets offered.",
  },
  {
    key: "personal",
    label: "Personal",
    blocks: true,
    hue: "var(--cal-off)",
    hint: "Dentist, school run, life.",
  },
  {
    key: "supplies",
    label: "Supplies",
    blocks: false,
    hue: "var(--cal-note)",
    hint: "A reminder. Does not take the time.",
  },
  {
    key: "other",
    label: "Other",
    blocks: false,
    hue: "var(--cal-note)",
    hint: "A note in the day.",
  },
];

export const categoryFor = (key: string | null | undefined): CategoryDef =>
  CATEGORIES.find((c) => c.key === key) ?? CATEGORIES[0];

/** Categories the owner adds by hand. Client work arrives from conversations. */
export const OWNER_CATEGORIES = CATEGORIES.filter(
  (c) => c.key !== "appointment" && c.key !== "consultation",
);

// ---------------------------------------------------------------- weeks

/** Monday-first, which is how a UK working week reads. */
export function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const shift = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - shift);
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** yyyy-mm-dd, for URLs and grouping. Local, not UTC — the day the user means. */
export function isoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

export function parseIsoDate(value: string | undefined): Date {
  const m = value && /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return new Date();
  return new Date(+m[1], +m[2] - 1, +m[3]);
}

// ---------------------------------------------------------------- repeats

/**
 * The values the `repeats` column can actually hold.
 *
 * Kept as its own type because the column is a Postgres enum, `repeat_rule`,
 * and writing a value it has not been told about does not degrade — PostgREST
 * refuses the whole statement. That is the shape of fault that emptied every
 * inbox on the platform for an hour in September, and check-migrations reads
 * this union and asks the database for each value so it cannot happen quietly.
 *
 * So anything offered on a screen but never stored belongs in RepeatRule below
 * and not in here, and the compiler is what keeps the two apart.
 */
export type StoredRepeat =
  | "none"
  | "daily"
  | "weekdays"
  | "weekly"
  | "fortnightly"
  | "monthly";

/**
 * What the diary offers, which is the stored values plus one that is not.
 *
 * "dates" exists only between the form and the add action: it means the days
 * were named one at a time, and by the time the rows are written there is no
 * pattern left to record, so each is stored as "none" and the set is held
 * together by repeat_parent_id like every other one. Adding it to the enum
 * would have meant a migration run by hand for no gain.
 */
export type RepeatRule = StoredRepeat | "dates";

export const REPEATS: { value: RepeatRule; label: string }[] = [
  { value: "none", label: "Just the once" },
  /*
   * Second in the list, above the patterns.
   *
   * It is the commonest thing after "just the once" for the trades that book
   * runs of visits — pet care, cleaning, anything covering a holiday — and
   * those are exactly the businesses that would otherwise give up and book it
   * six times.
   */
  { value: "dates", label: "On days I pick" },
  { value: "daily", label: "Every day" },
  { value: "weekdays", label: "Every weekday" },
  { value: "weekly", label: "Every week" },
  { value: "fortnightly", label: "Every 2 weeks" },
  { value: "monthly", label: "Every month" },
];

/**
 * What to put in the column for a given rule.
 *
 * One line, and it exists so the compiler carries the invariant rather than a
 * comment: the return type is StoredRepeat, so if anybody adds a value to
 * RepeatRule without deciding what the database should hold, this stops
 * building. A cast or a ternary at the call site would have let the next value
 * through silently, and silently is how the enum faults on this project have
 * always arrived.
 */
export function storedRepeat(rule: RepeatRule): StoredRepeat {
  return rule === "dates" ? "none" : rule;
}

/**
 * The most days that can be named one at a time.
 *
 * A guard rather than a design limit: every occurrence is a real row, and the
 * list arrives from a form, so there has to be a number past which it is
 * refused. Thirty covers a month of daily visits, which is the longest run
 * anybody has described.
 */
export const MOST_CHOSEN_DAYS = 30;

/**
 * The extra days somebody named, as plain local dates.
 *
 * Submitted as one comma-separated field of YYYY-MM-DD, because the form grows
 * and shrinks its own rows and a fixed set of named inputs cannot follow that.
 *
 * Sorted, de-duplicated, and anything unparseable dropped rather than thrown:
 * the value comes from a form, and an empty row somebody added and did not fill
 * in is the ordinary case, not an error worth stopping a booking for.
 *
 * `first` is excluded, because it is already the booking's own date and adding
 * it twice would make the second one clash with the first and be silently
 * skipped — which would look to the owner like a day they picked going missing.
 */
export function extraDates(raw: string | null | undefined, first?: Date | null): Date[] {
  const firstKey = first ? isoDate(first) : null;
  const seen = new Set<string>();

  for (const piece of (raw ?? "").split(",")) {
    const key = piece.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue;
    if (key === firstKey) continue;
    const at = parseIsoDate(key);
    /* parseIsoDate falls back to today on nonsense, so check it round-trips. */
    if (isoDate(at) !== key) continue;
    seen.add(key);
  }

  return [...seen]
    .sort()
    .slice(0, MOST_CHOSEN_DAYS)
    .map((key) => parseIsoDate(key));
}

/** How far ahead repeats are generated when no end date is given. */
export const REPEAT_HORIZON_DAYS = 182;

/**
 * The dates a rule falls on, starting from `first`.
 *
 * Occurrences are generated as real rows rather than computed on read, so the
 * no-overlap constraint and the assistant's availability query keep working
 * unchanged — and one week can be moved without breaking the pattern.
 */
export function repeatDates(first: Date, rule: RepeatRule, until: Date | null): Date[] {
  if (rule === "none") return [first];
  /*
   * Named days are not a pattern, so there is nothing here to generate.
   *
   * The caller adds the chosen days to this one — see extraDates and the add
   * action. Returning just the first is what makes "on days I pick" with
   * nothing picked yet behave exactly like "just the once", which is the right
   * answer for a half-filled form.
   */
  if (rule === "dates") return [first];

  const horizon = until ?? new Date(first.getTime() + REPEAT_HORIZON_DAYS * 86400_000);
  const dates: Date[] = [];
  const cursor = new Date(first);

  // A hard cap, so a bad rule cannot generate forever.
  for (let i = 0; i < 400 && cursor <= horizon; i++) {
    if (rule !== "weekdays" || (cursor.getDay() !== 0 && cursor.getDay() !== 6)) {
      dates.push(new Date(cursor));
    }

    switch (rule) {
      case "daily":
      case "weekdays":
        cursor.setDate(cursor.getDate() + 1);
        break;
      case "weekly":
        cursor.setDate(cursor.getDate() + 7);
        break;
      case "fortnightly":
        cursor.setDate(cursor.getDate() + 14);
        break;
      case "monthly": {
        /*
         * Counted from the first date, and clamped to the month's last day.
         *
         * Adding a month to the cursor each time drifted for good: the 31st
         * of January plus a month is the 3rd of March, and every month after
         * was the 3rd. The 31st now lands on the 28th or 29th in February and
         * back on the 31st in March, which is what "monthly" means to anybody.
         */
        const months = dates.length;
        const target = new Date(first);
        target.setDate(1);
        target.setMonth(first.getMonth() + months);
        const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
        target.setDate(Math.min(first.getDate(), lastDay));
        cursor.setTime(target.getTime());
        break;
      }
    }
  }

  return dates;
}

// ------------------------------------------------------- the next half hour

/**
 * The next half hour where the business is, as "HH:MM".
 *
 * What the diary's Add button opens at when the day being looked at is today.
 * Pulled out of the component so it can be tested: it was three lines of
 * Intl.DateTimeFormat inside a click handler, and the interesting cases — the
 * half hour exactly, and the last one of the day — could not be reached from a
 * test at all without waiting for the right minute to come round.
 *
 * `now` is a parameter for the same reason every other date function here takes
 * one: a test that depends on the wall clock passes and fails by the hour.
 *
 * Capped at 23:30 rather than rolling over to 00:00. Half past eleven at night
 * is already a strange thing to offer somebody; midnight *the previous day* is
 * a wrong one, and it would arrive as an appointment nobody could find.
 */
export function nextHalfHour(timezone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const at = Object.fromEntries(parts.map((p) => [p.type, p.value])) as Record<string, string>;

  // Midnight comes back as "24" from some runtimes, as it does in voice/regular.
  const hour = at.hour === "24" ? 0 : Number(at.hour);
  const minutes = hour * 60 + Number(at.minute);
  const next = Math.min(23 * 60 + 30, Math.ceil(minutes / 30) * 30);

  return `${String(Math.floor(next / 60)).padStart(2, "0")}:${String(next % 60).padStart(2, "0")}`;
}
