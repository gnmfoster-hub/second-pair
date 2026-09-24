import Link from "next/link";
import type { Capability } from "@/lib/readiness";
import { dismissCheck } from "@/app/(dashboard)/readinessActions";

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

  /*
   * Which of these are worth a paragraph on the inbox, and which are a line.
   *
   * Anything that stops the assistant doing its job keeps its row and its
   * button. Where nothing is blocking the assistant is working, so the panel
   * is advice rather than a fault: one row for the most useful thing, and the
   * rest as a line. One row rather than none, because a panel that is only
   * ever a line of grey text is a panel nobody reads.
   */
  const shown = blocking.length ? blocking : missing.slice(0, 1);
  const quieter = missing.filter((c) => !shown.includes(c));
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
          <Link href="/settings/working" className="text-sm font-medium text-accent hover:underline">
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
          <div className="text-[12.5px] font-medium text-muted">
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
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {next.action && (
              <Link href={next.href} className="btn inline-flex bg-accent text-on-accent">
                {next.action}
              </Link>
            )}

            {/*
              * The other answer, here too.
              *
              * This was only on the maintenance rows, and those are hidden
              * while a business is still being set up — which is exactly when
              * somebody is looking at this card and being told their
              * consultation time is too short. The one place it was needed was
              * the one place it was missing.
              */}
            {!next.blocking && (
              <form action={dismissCheck}>
                <input type="hidden" name="key" value={next.key} />
                <button
                  type="submit"
                  className="text-sm text-muted underline-offset-2 hover:text-foreground hover:underline"
                >
                  That&rsquo;s fine as it is
                </button>
              </form>
            )}
          </div>
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

      {/*
        * What is stopping it, and then a line about the rest.
        *
        * This listed every unfinished thing in full, which on a business part
        * way through set-up is four or five paragraphs — and it sits above the
        * enquiries on the one screen somebody keeps open all day. Measured on
        * the demo: the first conversation started 825 pixels down a 950 pixel
        * screen, so an inbox showed two of them.
        *
        * Anything that stops the assistant working still gets its own row and
        * its own button. The nudges that do not — a phone not signed up for
        * notifications — become one line underneath, because they are worth
        * knowing and not worth a paragraph every time you open the inbox.
        */}
      <ul
        className={`mt-4 divide-y divide-border border-t border-border ${
          settingUp ? "hidden" : ""
        }`}
      >
        {shown.map((capability) => (
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

            {/*
              * The whole line on a phone, sharing it from a tablet up.
              *
              * Giles: "on the mobile view inbox the buzz your phone message is
              * formatted wrong and stretches down the page."
              *
              * It did, and spectacularly: on Living Canvas the row was 717
              * pixels tall with one word on each line. flex-1 with min-w-0 lets
              * this shrink all the way to nothing, and the button and the
              * "that's fine" link beside it do not shrink at all — so on a
              * 390px screen the text was squeezed into about forty pixels and
              * wrapped a word at a time. Wrapping was allowed; there was simply
              * nothing to stop it shrinking first.
              *
              * basis-full takes the whole line, so the actions wrap underneath
              * where there is room for them. From sm up, flex-1 puts everything
              * back on one row, which is where it always looked right.
              */}
            <span className="min-w-0 basis-full sm:flex-1">
              <span className="block text-sm font-medium">{capability.can}</span>
              <span className="hint mt-0.5 block">{capability.otherwise}</span>
            </span>

            {capability.action && (
              <Link href={capability.href} className="btn-ghost shrink-0 py-1.5 text-xs">
                {capability.action}
              </Link>
            )}

            {/*
              * And the other answer, which the panel never had.
              *
              * Giles, on being told his consultation time was too short: if I
              * do not want to adjust it there should be a way of getting rid
              * of it. Some of this is advice, and advice you cannot answer is
              * advice you learn to scroll past — along with the row above it
              * that actually mattered.
              *
              * Never on a blocking one. "Nobody can book" is not a matter of
              * opinion, and a business must not be able to put it away.
              */}
            {!capability.blocking && (
              <form action={dismissCheck} className="shrink-0">
                <input type="hidden" name="key" value={capability.key} />
                <button
                  type="submit"
                  className="py-1.5 text-xs text-muted underline-offset-2 hover:text-foreground hover:underline"
                >
                  That&rsquo;s fine as it is
                </button>
              </form>
            )}
          </li>
        ))}

        {/*
          * Things to do, as things, rather than as a sentence about them.
          *
          * This was `.join(", ")` over everything outstanding, which reads as
          * one long comma-run somebody has to parse a clause at a time to find
          * the one that concerns them. They are separate jobs and each goes
          * somewhere different, so they are separate objects you can click.
          */}
        {quieter.length > 0 && (
          <li className="px-5 py-3">
            <p className="hint mb-2">Also worth doing</p>
            <div className="flex flex-wrap gap-1.5">
              {quieter.map((c) => (
                <Link
                  key={c.key}
                  href={c.href || "/settings/working"}
                  className="pill border border-border bg-surface text-muted transition-colors hover:border-accent/30 hover:text-foreground"
                >
                  {c.can}
                </Link>
              ))}
            </div>
          </li>
        )}
      </ul>

      {/*
        * What already works — folded away, because the count is the point.
        *
        * This listed all eleven in prose: a sixty-word run-on sentence that
        * took a third of the inbox and duplicated the "11/13 working" already
        * sitting in the heading four inches above it. The names are worth
        * something once, while you are setting the business up, and are noise
        * every morning after that.
        *
        * So the number stays where it was and the names go behind a line you
        * can open. Shut by default: nobody opening their inbox at seven in the
        * morning needs to be told the assistant can still take a deposit.
        */}
      {ready > 0 && (
        <details className="group border-t border-border">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-3 text-xs text-muted transition-colors hover:text-foreground">
            <span className="text-ok" aria-hidden>
              &#10003;
            </span>
            {ready} {ready === 1 ? "thing is" : "things are"} already working
            <span className="ml-auto text-[10px] transition-transform group-open:rotate-180" aria-hidden>
              &#9662;
            </span>
          </summary>
          <div className="flex flex-wrap gap-1.5 px-5 pb-4">
            {capabilities
              .filter((c) => c.ready)
              .map((c) => (
                <span key={c.key} className="pill bg-ok/10 text-ok">
                  {c.can}
                </span>
              ))}
          </div>
        </details>
      )}
    </div>
  );
}
