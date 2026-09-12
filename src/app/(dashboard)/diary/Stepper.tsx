import Link from "next/link";

/**
 * Back, today, forward.
 *
 * Its own component because it appears in two places on purpose: beside the
 * date on a phone, and with the other controls at every wider size.
 *
 * On a 360px screen the controls come to 385 pixels and have 313 — three view
 * buttons at 179, this at 100, the colour button and Add at 41 each, and the
 * gaps. Something has to give, and moving this up beside the date it steps
 * costs nothing: the date line is 135 pixels of a 313-pixel row, and the two
 * belong together anyway. It is where every calendar on a phone puts them.
 */
export function Stepper({
  back,
  forward,
  today,
  view = "day",
  className = "",
}: {
  back: string;
  forward: string;
  today: string;
  /** What the arrows step by, which is what the middle button returns to. */
  view?: "day" | "week" | "month";
  className?: string;
}) {
  /*
   * "This week" where there is room for it, "Today" where there is not.
   *
   * The arrows have always stepped by whatever the view shows — a day, a week,
   * a month — and the middle button has always said Today, which is accurate
   * about where it goes and quiet about what the arrows either side of it will
   * do. Saying the period out loud answers both.
   *
   * Measured before changing it: "Today" is 39 pixels, "This week" 66 and
   * "This month" 73, and the row they sit in on a phone has 27 spare. So the
   * longer word waits for a screen that can hold it, rather than undoing the
   * packing that got that row down to two lines.
   */
  const period = view === "week" ? "This week" : view === "month" ? "This month" : "Today";
  return (
    <div
      className={`items-center overflow-hidden rounded-xl border border-border bg-surface ${className}`}
    >
      <Link
        href={back}
        className="px-2.5 py-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-foreground sm:px-3 sm:py-2"
        aria-label={view === "week" ? "Previous week" : view === "month" ? "Previous month" : "Previous day"}
      >
        ‹
      </Link>
      <Link
        href={today}
        className="border-x border-border px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-foreground sm:px-3.5 sm:py-2"
        title={`Back to ${period.toLowerCase()}`}
      >
        <span className="sm:hidden">Today</span>
        <span className="hidden sm:inline">{period}</span>
      </Link>
      <Link
        href={forward}
        className="px-2.5 py-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-foreground sm:px-3 sm:py-2"
        aria-label={view === "week" ? "Next week" : view === "month" ? "Next month" : "Next day"}
      >
        ›
      </Link>
    </div>
  );
}
