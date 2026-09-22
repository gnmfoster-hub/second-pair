import Link from "next/link";

/**
 * The shape the four section pages share.
 *
 * /system, /websites, /apps and /work were each a heading and three sentences,
 * written when the brief said not to invent content. Giles has since asked for
 * real selling pages, so they have one: a statement, the argument in ruled
 * entries, and the one call to action the site has.
 *
 * One component rather than four near-copies, because the next time the shape
 * changes it should change in one place. The entries use .index-item, which is
 * the same rule-and-tick the home page uses, so a visitor arriving on any of
 * these recognises where they are.
 */

export function Hero({
  eyebrow,
  title,
  lede,
}: {
  eyebrow: string;
  title: React.ReactNode;
  lede: React.ReactNode;
}) {
  return (
    <header className="shell pt-14 sm:pt-20">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{eyebrow}</p>
      <h1
        className="mt-3"
        style={{
          fontFamily: "var(--font-display), Impact, sans-serif",
          textTransform: "uppercase",
          lineHeight: 0.96,
          letterSpacing: "0.01em",
          fontSize: "clamp(40px, 5.4vw, 82px)",
          maxWidth: "18ch",
        }}
      >
        {title}
      </h1>
      <p className="mt-7 max-w-[58ch] text-[19px] leading-relaxed">{lede}</p>
    </header>
  );
}

export function Section({
  title,
  intro,
  children,
  tinted,
}: {
  title: string;
  intro?: React.ReactNode;
  children: React.ReactNode;
  /** A different ground, so two long sections do not run into each other. */
  tinted?: boolean;
}) {
  const inner = (
    <div className="shell py-14 sm:py-20">
      <h2 className="page-title">{title}</h2>
      {intro && <p className="mt-4 max-w-[62ch] text-base leading-relaxed text-muted">{intro}</p>}
      <div className="mt-8 grid gap-x-10 gap-y-7 sm:grid-cols-2 xl:grid-cols-3">{children}</div>
    </div>
  );

  return tinted ? (
    <section className="border-y border-border bg-surface">{inner}</section>
  ) : (
    <section>{inner}</section>
  );
}

export function Item({ head, children }: { head: string; children: React.ReactNode }) {
  return (
    <div className="index-item">
      <h3 className="section-title text-[0.95rem]">{head}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">{children}</p>
    </div>
  );
}

/**
 * The close.
 *
 * Every page ends the same way and in the same place, because the site has one
 * thing it wants somebody to do. Cobalt, per §8, and the button is ink on it.
 */
export function Close({ line, note }: { line: string; note?: React.ReactNode }) {
  return (
    <section style={{ background: "var(--accent)", color: "var(--on-accent)" }}>
      <div className="shell py-16 sm:py-20">
        <h2
          style={{
            fontFamily: "var(--font-display), Impact, sans-serif",
            textTransform: "uppercase",
            lineHeight: 0.96,
            letterSpacing: "0.01em",
            fontSize: "clamp(34px, 4.4vw, 56px)",
            maxWidth: "16ch",
          }}
        >
          {line}
        </h2>
        {note && (
          <p className="mt-5 max-w-lg text-base leading-relaxed" style={{ opacity: 0.85 }}>
            {note}
          </p>
        )}
        <div className="mt-9 flex flex-wrap items-center gap-5">
          <a href="/home#ask" className="btn-ink inline-flex" style={{ minHeight: 54 }}>
            Book a 15 minute chat
          </a>
          <Link
            href="/home"
            className="text-sm font-medium underline underline-offset-4"
            style={{ opacity: 0.9 }}
          >
            Or watch it answer first
          </Link>
        </div>
      </div>
    </section>
  );
}
