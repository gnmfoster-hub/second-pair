import Link from "next/link";
import type { Capability } from "@/lib/readiness";

/**
 * What the assistant can and cannot do yet.
 *
 * Replaces a list of chores with a list of consequences. "Add your services"
 * is a task somebody puts off; "it cannot put a number on anything" is a thing
 * happening to their business right now.
 *
 * Disappears entirely once everything is ready. A permanent panel saying
 * "all good" is furniture.
 *
 * Two moods, because a business three minutes old and a business three months
 * old need opposite things from the same information. Somebody who has just
 * been set up is looking at eight red lines and no idea which to touch, and a
 * wall of faults reads as a broken product rather than an unfinished one. So
 * while most of it is undone it walks: one thing, the next thing, and the rest
 * folded away behind a count.
 *
 * Once a business is mostly working the list is the right shape — those are
 * maintenance, they are unrelated to each other, and somebody skimming wants
 * to see all of them at once.
 */
export function Readiness({ capabilities }: { capabilities: Capability[] }) {
  const missing = capabilities.filter((c) => !c.ready);
  if (missing.length === 0) return null;

  const blocking = missing.filter((c) => c.blocking);
  const ready = capabilities.length - missing.length;

  /*
   * Still being set up, rather than needing a tidy.
   *
   * Half undone is the line. Below it somebody is maintaining a working
   * assistant; above it they are still building one, and being handed the
   * whole list at once is how they put it off entirely.
   */
  const settingUp = missing.length > capabilities.length / 2;
  const next = missing[0];
  const after = missing.slice(1);
  const done = capabilities.filter((c) => c.ready);

  return (
    <div
      className={`card mt-4 overflow-hidden ${blocking.length ? "border-warn/40" : ""}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-5">
        <h2 className="section-title">
          {settingUp
            ? "Let's get you set up"
            : blocking.length
              ? "Your assistant is not ready yet"
              : "Your assistant could do more"}
        </h2>
        <span className="flex items-baseline gap-3">
          <span className="hint num">
            {ready}/{capabilities.length} working
          </span>
          {/* The same list as a walk-through, in the order to do it in. */}
          <Link href="/setup" className="text-sm font-medium text-accent hover:underline">
            {settingUp ? "Walk me through it" : "See set-up"}
          </Link>
        </span>
      </div>

      <div className="mx-5 mt-3 h-1 overflow-hidden rounded-full bg-surface-2">
        <div
          className={`h-full rounded-full transition-[width] ${
            blocking.length ? "bg-warn" : "bg-accent"
          }`}
          style={{ width: `${(ready / capabilities.length) * 100}%` }}
        />
      </div>

      {/*
       * One thing at a time while there is a lot of it.
       *
       * The first missing capability is the one to do next — the list is
       * ordered by what breaks first, so somebody who fixes only the top item
       * has fixed the thing their next customer would have hit.
       */}
      {settingUp && (
        <div className="mx-5 mt-4 rounded-xl border border-accent/30 bg-accent/5 p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-muted">
            Next
          </div>
          <div className="mt-1 font-medium">{next.can}</div>
          <p className="hint mt-1">{next.otherwise}</p>
          {/*
            * Only where there is something to press.
            *
            * Some of these are nobody-in-the-building's to fix — the platform
            * key is ours, and a stylist's own Stripe account can only be
            * connected by her. A button sending an owner somewhere that
            * cannot do it is worse than no button: it spends the one trip
            * they were going to make.
            */}
          {next.action && (
            <Link href={next.href} className="btn mt-3 inline-flex bg-accent text-on-accent">
              {next.action}
            </Link>
          )}
        </div>
      )}

      {settingUp && after.length > 0 && (
        <details className="mx-5 mt-3">
          <summary className="cursor-pointer text-sm text-muted">
            {after.length} more after that
          </summary>
          <ul className="mt-2 space-y-1.5">
            {after.map((capability) => (
              <li key={capability.key} className="flex items-baseline gap-2 text-sm">
                <span className="text-muted">·</span>
                <span className="min-w-0 flex-1">{capability.can}</span>
                {capability.action && (
                  <Link href={capability.href} className="shrink-0 text-xs text-muted hover:text-foreground">
                    {capability.action}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      {/*
        * And what is already done, ticked off.
        *
        * This panel only ever showed what was missing, which is the right
        * emphasis and the wrong feeling. Setting a business up is eight or
        * nine jobs across a couple of evenings, and a screen that shows only
        * what is left never once says "you have done five of these". It was
        * asked for as a tick-off list, and the ticks were the missing half.
        *
        * Folded away, because what you have finished is not what you came to
        * the screen for. The count above is the part read at a glance; this is
        * for the evening somebody comes back and cannot remember whether they
        * did the opening hours.
        */}
      {settingUp && done.length > 0 && (
        <details className="mx-5 mt-3">
          <summary className="cursor-pointer text-sm text-muted">
            {done.length} already done
          </summary>
          <ul className="mt-2 space-y-1.5">
            {done.map((capability) => (
              <li
                key={capability.key}
                className="flex items-baseline gap-2 text-sm text-muted"
              >
                <span aria-hidden className="text-ok">
                  ✓
                </span>
                <span className="min-w-0 flex-1">{capability.can}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {settingUp && <div className="h-5" />}

      <ul
        className={`mt-4 divide-y divide-border border-t border-border ${
          settingUp ? "hidden" : ""
        }`}
      >
        {missing.map((capability) => (
          <li
            key={capability.key}
            className="flex flex-wrap items-start gap-x-4 gap-y-2 px-5 py-3.5"
          >
            <span
              className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-full text-[10px] ${
                capability.blocking
                  ? "bg-warn/15 text-warn"
                  : "border border-border text-muted"
              }`}
              aria-hidden
            >
              {capability.blocking ? "!" : ""}
            </span>

            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{capability.can}</span>
              <span className="hint mt-0.5 block">{capability.otherwise}</span>
            </span>

            {capability.action && (
              <Link href={capability.href} className="btn-ghost shrink-0 py-1.5 text-xs">
                {capability.action}
              </Link>
            )}
          </li>
        ))}
      </ul>

      {/* What already works, so the list is not only a telling-off. */}
      {ready > 0 && (
        <div className="border-t border-border bg-surface-2/40 px-5 py-3">
          <p className="hint">
            Already working:{" "}
            {capabilities
              .filter((c) => c.ready)
              .map((c) => c.can.toLowerCase())
              .join(", ")}
            .
          </p>
        </div>
      )}
    </div>
  );
}
