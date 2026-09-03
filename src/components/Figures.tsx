import type React from "react";

/**
 * A row of figures, ruled rather than boxed.
 *
 * Written for the back office and moved here when the inbox needed the same
 * thing, because two copies of a look is how a product stops having one.
 *
 * The idea is a card as the container and hairlines inside it, instead of a
 * grid of separate cards. Separate cards make every number its own object and
 * give them all equal weight, which is exactly wrong for a row that is meant
 * to be read left to right as one sentence about how things are going.
 */
export function Band({ children, divided }: { children: React.ReactNode; divided?: boolean }) {
  /*
   * The gap is the rule.
   *
   * One pixel of gap over a border-coloured background costs nothing to keep
   * aligned, and it cannot end up with a doubled line where two cells meet the
   * way per-cell borders do.
   */
  return (
    <div
      className={`grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] ${
        divided ? "border-t border-border" : ""
      }`}
    >
      {children}
    </div>
  );
}

export function Figure({
  value,
  label,
  note,
  lead,
  warn,
  accent,
  children,
}: {
  value?: string;
  label: string;
  note?: string;
  /** The one figure the row is about. */
  lead?: boolean;
  warn?: boolean;
  /** Carries the brand colour without being the lead figure. */
  accent?: boolean;
  /** For a live number that counts up; used instead of `value`. */
  children?: React.ReactNode;
}) {
  /*
   * Painted on the card's own surface, not the page behind it.
   *
   * These paint a background so the one-pixel gaps between them show as rules
   * — but painting the paper colour put the page back on top of the card and
   * made the card invisible. It has to be the surface the card is drawn in.
   */
  return (
    <div className="bg-surface px-5 py-5">
      <div
        className={`font-display font-bold tabular-nums leading-none tracking-[-0.03em] ${
          lead ? "text-4xl" : "text-2xl"
        } ${warn ? "text-warn" : lead || accent ? "text-highlight-strong" : ""}`}
      >
        {children ?? value}
      </div>
      <div className="mt-2.5 text-[11px] font-semibold uppercase tracking-[0.09em] text-muted">
        {label}
      </div>
      {note && <div className="mt-1 text-[12px] leading-snug text-muted/80">{note}</div>}
    </div>
  );
}
