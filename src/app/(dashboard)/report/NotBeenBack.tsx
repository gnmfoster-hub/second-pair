import Link from "next/link";
import { formatPence } from "@/lib/money";
import type { Lapsed } from "@/lib/lapsed";

/**
 * The people who have quietly stopped coming.
 *
 * Nobody notices this happen. A regular misses one appointment, then the next,
 * and nothing anywhere says so — the diary shows who is coming, never who has
 * stopped. A salon finds out when they see somebody in the street with a
 * haircut they did not do.
 *
 * Measured against each person's own rhythm rather than a fixed number of
 * days, which is the only version of this that is true for the colour every
 * five weeks and the cut twice a year at the same time. See lib/lapsed.
 *
 * Deliberately a list of people to ring, not a button that texts them all.
 * Sending forty "we miss you" messages in one press is the fastest way to turn
 * a customer list into a spam complaint, and the value here is in the three
 * names the owner reads and recognises.
 */
export function NotBeenBack({ people }: { people: Lapsed[] }) {
  if (people.length === 0) return null;

  const weeks = (days: number) => {
    if (days < 14) return `${days} days`;
    if (days < 70) return `${Math.round(days / 7)} weeks`;
    return `${Math.round(days / 30)} months`;
  };

  return (
    <section className="mt-8">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="section-title">Who hasn&rsquo;t been back</h2>
        <span className="hint">{people.length} worth a look</span>
      </div>

      <p className="hint mt-1 max-w-prose">
        Past their own usual gap, not past a fixed number of days &mdash; so somebody who
        comes every five weeks shows up here long before somebody who comes twice a year.
        Anybody already booked in is left out.
      </p>

      <ul className="mt-3 space-y-1.5">
        {people.slice(0, 12).map((p) => (
          <li key={p.contactId}>
            <Link
              href={`/clients/${p.contactId}`}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 rounded-lg px-3 py-2 transition-colors hover:bg-surface-2"
            >
              <span className="font-medium">{p.name ?? "Somebody"}</span>

              <span className="hint">
                last in {weeks(p.daysSince)} ago &middot; normally every{" "}
                {weeks(p.usualGapDays)}
                {p.basis === "how often people come here" && (
                  <>
                    {" "}
                    {/*
                      * Said out loud, because it is a weaker claim. "She is
                      * overdue" and "people like her would have been back by
                      * now" are different sentences, and an owner deciding
                      * whether to ring somebody deserves to know which one
                      * this is.
                      */}
                    (been once &mdash; measured against everyone else)
                  </>
                )}
              </span>

              <span className="ml-auto tabular-nums">
                {p.pence > 0 && formatPence(p.pence)}
                <span className="hint ml-2">
                  {p.visits} {p.visits === 1 ? "visit" : "visits"}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {people.length > 12 && (
        <p className="hint mt-2">
          And {people.length - 12} more. These are the furthest past their own rhythm.
        </p>
      )}
    </section>
  );
}
