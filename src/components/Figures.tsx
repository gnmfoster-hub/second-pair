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
export function Band({
  children,
  divided,
  inline,
}: {
  children: React.ReactNode;
  divided?: boolean;
  /**
   * One line rather than a band of tiles.
   *
   * The three figures on the inbox took a hundred and ten pixels of the one
   * screen a business keeps open all day, to say three numbers — and they sat
   * above the enquiries, which are what somebody opened the page for. Read as
   * a line they say the same thing in a fifth of the room, and the money can
   * still be the loud part of it.
   */
  inline?: boolean;
}) {
  if (inline) {
    return (
      <div
        className={`flex flex-wrap items-baseline gap-x-6 gap-y-1 px-4 py-2.5 ${
          divided ? "border-t border-border" : ""
        }`}
      >
        {children}
      </div>
    );
  }

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
  act,
  children,
  inline,
}: {
  value?: string;
  label: string;
  note?: string;
  /** The one figure the row is about. Bigger, not coloured — size is enough. */
  lead?: boolean;
  warn?: boolean;
  /**
   * Something here wants doing.
   *
   * This is the only thing the orange means anywhere in the product, and it
   * was being spent on good news: the money won while they were shut, and the
   * day's takings, both in orange, while the figure labelled "Need you" was
   * the dullest of the three. Orange on the takings does not tell anybody
   * anything — a big bold number is already the loudest thing on the row —
   * and every place it is spent is a place it stops meaning "act".
   */
  act?: boolean;
  /** For a live number that counts up; used instead of `value`. */
  children?: React.ReactNode;
  /** On one line with its label, for a Band that is a line. */
  inline?: boolean;
}) {
  if (inline) {
    return (
      <span className="inline-flex items-baseline gap-1.5 whitespace-nowrap">
        <span
          className={`font-display font-bold tabular-nums tracking-[-0.02em] ${
            act ? "text-lg text-highlight-strong" : warn ? "text-lg text-warn" : "text-lg"
          }`}
        >
          {children ?? value}
        </span>
        <span className="text-[13px] text-muted">{label.toLowerCase()}</span>
        {note && <span className="text-[12px] text-muted/70">&middot; {note}</span>}
      </span>
    );
  }

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
        } ${warn ? "text-warn" : act ? "text-highlight-strong" : ""}`}
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
