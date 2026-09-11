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
  className = "",
}: {
  back: string;
  forward: string;
  today: string;
  className?: string;
}) {
  return (
    <div
      className={`items-center overflow-hidden rounded-xl border border-border bg-surface ${className}`}
    >
      <Link
        href={back}
        className="px-2.5 py-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-foreground sm:px-3 sm:py-2"
        aria-label="Previous"
      >
        ‹
      </Link>
      <Link
        href={today}
        className="border-x border-border px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-foreground sm:px-3.5 sm:py-2"
      >
        Today
      </Link>
      <Link
        href={forward}
        className="px-2.5 py-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-foreground sm:px-3 sm:py-2"
        aria-label="Next"
      >
        ›
      </Link>
    </div>
  );
}
