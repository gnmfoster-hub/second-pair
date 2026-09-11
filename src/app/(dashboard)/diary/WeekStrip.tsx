import Link from "next/link";
import { addDays, isoDate, startOfWeek } from "@/lib/calendar";

/**
 * Seven days across the top, with how busy each one is.
 *
 * The pattern every calendar on a phone has converged on — Google, Apple,
 * Fresha, Booksy — and for a good reason: the day view's weakness is that it
 * tells you nothing about tomorrow. Stepping through days one arrow at a time
 * to find out whether Thursday is full is the slowest possible way to answer
 * the question an owner asks most.
 *
 * It replaces the back/today/forward stepper rather than joining it, so the
 * space it takes is space the stepper gave back, and what you get for those
 * pixels is the whole week at a glance instead of one day and two arrows.
 *
 * A bar under each date rather than a number: "3" and "5" are hard to compare
 * at a glance and mean nothing without knowing the day's length, while a bar
 * that is nearly full plainly says nearly full.
 */

export type DayLoad = {
  /** YYYY-MM-DD in the business's own timezone. */
  date: string;
  /** 0 to 1, how much of the working day is spoken for. */
  full: number;
  /** Whether the business is open at all. */
  open: boolean;
};

export function WeekStrip({
  focusDay,
  load,
  who,
  today,
}: {
  focusDay: Date;
  load: DayLoad[];
  /** Kept on the link so filtering by person survives a day change. */
  who: string | null;
  /** Stamped on the server so the first paint is right. */
  today: string;
}) {
  const monday = startOfWeek(focusDay);
  const focused = isoDate(focusDay);

  const byDate = new Map(load.map((d) => [d.date, d]));

  return (
    <div
      data-no-swipe
      className="mt-3 flex gap-1 sm:hidden"
      role="group"
      aria-label="The week"
    >
      {Array.from({ length: 7 }, (_, i) => {
        const day = addDays(monday, i);
        const key = isoDate(day);
        const on = byDate.get(key);
        const isFocused = key === focused;
        const isToday = key === today;

        const letter = new Intl.DateTimeFormat("en-GB", { weekday: "narrow" }).format(day);
        const number = new Intl.DateTimeFormat("en-GB", { day: "numeric" }).format(day);

        return (
          <Link
            key={key}
            href={`/diary?view=day&day=${key}${who ? `&who=${who}` : ""}`}
            aria-current={isFocused ? "date" : undefined}
            className={`flex min-h-[3.4rem] flex-1 flex-col items-center justify-center gap-1 rounded-xl border py-1.5 transition-colors ${
              isFocused
                ? "border-accent bg-accent/10"
                : "border-transparent bg-surface-2/50"
            }`}
          >
            <span
              className={`text-[0.62rem] uppercase leading-none ${
                isFocused ? "text-accent" : "text-muted"
              }`}
            >
              {letter}
            </span>

            <span
              className={`text-[0.9rem] font-semibold leading-none tabular-nums ${
                isToday && !isFocused ? "text-accent" : ""
              }`}
            >
              {number}
            </span>

            {/*
              * How full, as a bar rather than a count.
              *
              * A closed day gets nothing at all — an empty track on a Sunday
              * reads as "wide open, come on in", which is the opposite of
              * shut.
              */}
            {/*
              * Wider and taller than the first attempt, which was four pixels
              * by twenty and read as a speck rather than a measure — the whole
              * point is comparing seven of them at a glance, and you cannot
              * compare specks. It now fills the width of the date above it.
              */}
            {on?.open ? (
              <span
                className="h-1.5 w-full max-w-[1.75rem] overflow-hidden rounded-full bg-border/70"
                aria-hidden
              >
                <span
                  className="block h-full rounded-full bg-accent"
                  style={{ width: `${Math.max(on.full > 0 ? 14 : 0, Math.round(Math.min(1, on.full) * 100))}%` }}
                />
              </span>
            ) : (
              <span className="h-1.5 w-full max-w-[1.75rem]" aria-hidden />
            )}
          </Link>
        );
      })}
    </div>
  );
}
