/**
 * The shell both legal pages sit in.
 *
 * Narrow measure, generous leading, and a visible marker on anything still
 * needing a human decision — a draft that does not admit it is a draft is how
 * a placeholder ends up in front of a regulator.
 */
export function Legal({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-2xl px-5 py-14 sm:px-8 sm:py-20">
      <h1 className="page-title text-3xl">{title}</h1>
      <p className="hint mt-2">Last updated {updated}</p>

      <div className="legal mt-10">{children}</div>

      <style>{`
        .legal .lede { font-size: 1.05rem; line-height: 1.7; margin: 0 0 2rem; }
        .legal p { margin: 0 0 1rem; line-height: 1.7; }
        .legal ul { margin: 0 0 1rem; padding-left: 1.25rem; line-height: 1.7; }
        .legal li { margin-bottom: 0.5rem; }
        .legal a { color: var(--accent); text-underline-offset: 2px; }
        /* Anything still needing a human decision, marked so it cannot slip
           through unnoticed into a live page. */
        .legal .draft {
          border-left: 3px solid var(--warn);
          background: color-mix(in srgb, var(--warn) 9%, transparent);
          border-radius: 0 8px 8px 0;
          padding: 0.75rem 1rem;
          color: var(--foreground);
        }
      `}</style>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-9">
      <h2 className="section-title mb-3 text-base">{title}</h2>
      <div className="text-sm text-muted [&_strong]:font-semibold [&_strong]:text-foreground">
        {children}
      </div>
    </section>
  );
}
