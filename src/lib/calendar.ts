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
