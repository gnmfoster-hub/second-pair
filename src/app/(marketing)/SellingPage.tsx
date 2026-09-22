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

/**
 * A real screenshot, framed as the thing it is.
 *
 * Giles asked for shots of the actual product rather than descriptions of it. These
 * are taken from the salon demo — made-up people, made-up money — so nothing on
 * a customer's screen is on a public page.
 *
 * The frame is a browser rather than a floating rectangle: a bar with three
 * dots and the address, which is the one piece of chrome that makes a
 * screenshot read as software rather than as a picture.
 */
export function Shot({
  src,
  alt,
  address,
  caption,
  tinted,
}: {
  src: string;
  alt: string;
  address: string;
  caption?: React.ReactNode;
  tinted?: boolean;
}) {
  const inner = (
    <div className="shell py-12 sm:py-16">
      <figure className="m-0">
        <div
          className="overflow-hidden"
          style={{
            borderRadius: 16,
            border: "1px solid var(--foreground)",
            boxShadow:
              "0 2px 4px rgba(22,21,15,0.14), 0 26px 50px -28px rgba(22,21,15,0.55)",
          }}
        >
          <div
            className="flex items-center gap-2 px-3.5 py-2.5"
            style={{ background: "var(--putty)", borderBottom: "1px solid var(--foreground)" }}
          >
            <span aria-hidden className="flex gap-1.5">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="block size-2.5 rounded-full"
                  style={{ background: "var(--foreground)", opacity: 0.28 }}
                />
              ))}
            </span>
            <span
              className="ml-2 truncate rounded-full px-3 py-1 text-[12px]"
              style={{ background: "var(--background)", color: "var(--muted)" }}
            >
              {address}
            </span>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt} width={1800} height={1209} className="block w-full" />
        </div>
        {caption && (
          <figcaption className="mt-4 max-w-[62ch] text-sm leading-relaxed text-muted">
            {caption}
          </figcaption>
        )}
      </figure>
    </div>
  );

  return tinted ? (
    <section className="border-y border-border bg-surface">{inner}</section>
  ) : (
    <section>{inner}</section>
  );
}

/**
 * A call to action partway down, because the close is a long way from the top.
 *
 * Deliberately quieter than the cobalt band at the foot: a rule, a line and a
 * button. One loud close per page is enough, and two would read as nagging.
 */
export function Ask({ line, cta = "Book a 15 minute chat" }: { line: string; cta?: string }) {
  return (
    <section>
      <div className="shell">
        <div
          className="flex flex-wrap items-center justify-between gap-6 py-10"
          style={{ borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}
        >
          <p
            className="max-w-[30ch]"
            style={{
              fontFamily: "var(--font-display), Impact, sans-serif",
              textTransform: "uppercase",
              lineHeight: 0.98,
              letterSpacing: "0.01em",
              fontSize: "clamp(22px, 2.4vw, 30px)",
            }}
          >
            {line}
          </p>
          <a href="/home#ask" className="btn-primary shrink-0">
            {cta}
          </a>
        </div>
      </div>
    </section>
  );
}
