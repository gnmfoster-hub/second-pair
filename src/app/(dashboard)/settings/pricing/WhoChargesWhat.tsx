import Link from "next/link";
import { formatPence } from "@/lib/money";
import type { Artist } from "@/lib/types";

/**
 * Why the columns above differ, and where to change it.
 *
 * The quote table shows what each person would charge and gives no hint where
 * those numbers come from — so an owner looking for "different prices per team
 * member" finds a table of identical figures and concludes the product cannot
 * do it. It can, and always could: on this pricing model a person's price is
 * their hourly rate and their minimum, which live on the person, two screens
 * away, under a heading about staff rather than money.
 *
 * Showing the rates here rather than only linking to them is the point. The
 * answer to "why are these all the same" is visible in one glance — they are
 * all on the same rate — which is a different and much more useful answer than
 * "go and look".
 */
export function WhoChargesWhat({
  artists,
  words,
}: {
  artists: Artist[];
  words: { practitioner: string; practitioners: string };
}) {
  if (artists.length === 0) return null;

  const rates = new Set(artists.map((a) => a.hourly_rate_pence));
  const allSame = rates.size === 1 && artists.length > 1;

  return (
    <section className="card p-5">
      <h2 className="section-title">What each {words.practitioner} charges</h2>
      <p className="hint mt-1 max-w-prose">
        On this way of pricing, the difference between one {words.practitioner} and
        another <em>is</em> their hourly rate and their minimum &mdash; the sizes above
        are the same work whoever does it. Change a rate and every quote for that person
        moves with it.
      </p>

      <ul className="mt-4 divide-y divide-border">
        {artists.map((a) => (
          <li key={a.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5">
            <span className="font-medium">{a.name}</span>
            <span className="hint tabular-nums">
              {formatPence(a.hourly_rate_pence)}/hour
            </span>
            <span className="hint tabular-nums">
              minimum {formatPence(a.min_charge_pence)}
            </span>
            <Link
              href={`/settings/artists#${a.id}`}
              className="ml-auto text-sm text-muted hover:text-foreground"
            >
              Change
            </Link>
          </li>
        ))}
      </ul>

      {/*
       * Said out loud, because it is the actual answer to the question that
       * brings somebody to this page. A table of identical numbers looks like
       * a product that cannot tell people apart; it is a team nobody has told
       * apart yet.
       */}
      {allSame && (
        <p className="hint mt-4 rounded-lg bg-surface-2 px-3 py-2">
          Every {words.practitioner} is on the same rate at the moment, which is why the
          quotes above match. Give a senior a higher rate and their column moves on its
          own.
        </p>
      )}
    </section>
  );
}
