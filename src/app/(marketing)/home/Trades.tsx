import { VERTICALS_BY_CATEGORY } from "@/lib/verticals";
import type { CSSProperties } from "react";
import { Passing } from "./scroll";

/**
 * Every trade it is built for, as a wall of type.
 *
 * These were thirty-odd small pills, which is the right way to show a list
 * and the wrong way to show a claim. The claim is breadth, so they are set in
 * the display face at headline size, a row to each category, and the rows
 * run on as one block of type. Nothing is repeated to pad
 * a row out: each trade is on the page once, so it is also still a list.
 *
 * As the wall passes, the trades ink in one after another. Without script
 * they are simply all inked.
 */
export function Trades() {
  return (
    <section className="sp-trades border-y border-border bg-surface">
      <div className="shell pt-16 sm:pt-20">
        <h2 className="page-title sp-big-title">Built for whatever you actually do</h2>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted">
          Each trade brings its own questions, services, wording and reminders, and its
          own sense. The gas engineer won&rsquo;t book someone who says they can smell
          gas, it gives them the emergency number. The plumber tells a burst pipe where
          the stopcock is first.
        </p>
      </div>

      <Passing className="sp-trades-wall">
        {VERTICALS_BY_CATEGORY.map((group, i) => (
          <div
            key={group.category}
            className="sp-trades-row"
            style={{ "--row": i, "--rows": VERTICALS_BY_CATEGORY.length, "--n": group.trades.length } as CSSProperties}
          >
            <h3 className="sr-only">{group.category}</h3>
            <ul>
              {group.trades.map((pack, n) => (
                <li key={pack.id} style={{ "--i": n } as CSSProperties}>
                  {pack.label}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </Passing>
    </section>
  );
}
