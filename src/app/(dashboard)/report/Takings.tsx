import { formatPence } from "@/lib/money";
import type { Takings as Figures } from "@/lib/takings";

/**
 * What the week was worth, and who did it.
 *
 * Everything in the diary, however it got there. The panel above measures what
 * the assistant won, which is a different and narrower question — a booking
 * somebody typed in after a phone call has no conversation behind it, so none
 * of it appeared in any money figure until now. In a salon that is most of the
 * week.
 *
 * Not a leaderboard, and the wording is careful about it. A senior doing
 * fewer, dearer appointments and an apprentice doing more, cheaper ones are
 * both a good week, and a panel that implied otherwise would be read by the
 * person it named.
 */
export function Takings({
  figures,
  byService,
  runningLow = [],
}: {
  figures: Figures;
  byService: Figures["byService"];
  /**
   * Products down to their last few, where the shop counts them at all.
   *
   * Not part of the week's figures — a shelf with one bottle left needs
   * reordering in a quiet week more than a busy one — but this is the page
   * somebody reads once a week, so it is where a reorder gets noticed.
   */
  runningLow?: { name: string; stock: number }[];
}) {
  if (figures.bookings === 0) return null;

  const most = figures.byPerson[0]?.pence ?? 0;

  return (
    <section className="card mt-4 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="section-title">What the week came to</h2>
        <span className="hint tabular-nums">
          {figures.bookings} appointments
        </span>
      </div>

      <div className="mt-1 text-2xl font-semibold tabular-nums">
        {formatPence(figures.pence)}
      </div>

      {/*
       * Said plainly, because the total is wrong by exactly this much and
       * somebody comparing it against their own takings deserves to know why
       * rather than concluding the product cannot count.
       */}
      {figures.unpriced > 0 && (
        <p className="hint mt-1">
          {figures.unpriced} of them have no price on, so they are counted as
          appointments and not as money.
        </p>
      )}

      <div className="mt-5 space-y-2">
        {figures.byPerson.map((person) => (
          <div key={person.id}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium">{person.name}</span>
              <span className="tabular-nums">
                {formatPence(person.pence)}
                <span className="hint ml-2">{person.bookings}</span>
              </span>
            </div>
            {/*
             * A bar against the busiest rather than against the total, so the
             * shape of the week is readable at a glance on a phone. Relative
             * to whoever took most, which is the only comparison that stays
             * legible when one person is off.
             */}
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-accent/60"
                style={{ width: most > 0 ? `${(person.pence / most) * 100}%` : "0%" }}
              />
            </div>
          </div>
        ))}
      </div>

      {byService.length > 0 && (
        <div className="mt-6 border-t border-border pt-4">
          <div className="label">What sold</div>
          <ul className="mt-2 space-y-1.5">
            {byService.slice(0, 8).map((service) => (
              <li
                key={service.name}
                className="flex items-baseline justify-between gap-3 text-sm"
              >
                <span className="min-w-0 truncate">{service.name}</span>
                <span className="tabular-nums">
                  {formatPence(service.pence)}
                  <span className="hint ml-2">{service.bookings}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/*
        * How much of it has actually been taken.
        *
        * The figures above are what the week was worth: every appointment at
        * its price, whether anybody has paid or not. That is the right answer
        * to "what did we do" and no answer at all to "what came in", and until
        * an appointment could be closed out with a bill there was nothing that
        * could tell the two apart.
        *
        * Shown only once something has been taken this way. A business still
        * writing it in a book should not be told every week that it has taken
        * nothing.
        */}
      {figures.sales.taken > 0 && (
        <div className="mt-6 border-t border-border pt-4">
          <div className="flex items-baseline justify-between gap-3">
            <div className="label">Taken at the desk</div>
            <div className="tabular-nums">{formatPence(figures.sales.taken)}</div>
          </div>
          <p className="hint mt-1">
            Paid for and closed off, out of {formatPence(figures.pence)} booked. Cash, a
            card machine, a phone or a link &mdash; all of it.
          </p>
        </div>
      )}

      {/*
        * The counter, kept apart from the diary.
        *
        * Shown only once something has been sold, because a business that
        * sells nothing over the counter should not have an empty shelf
        * reported at it every week.
        */}
      {figures.sales.count > 0 && (
        <div className="mt-6 border-t border-border pt-4">
          <div className="flex items-baseline justify-between gap-3">
            <div className="label">Over the counter</div>
            <div className="tabular-nums">
              {formatPence(figures.sales.pence)}
              <span className="hint ml-2">
                {figures.sales.count} {figures.sales.count === 1 ? "sale" : "sales"}
              </span>
            </div>
          </div>


          {figures.sales.byItem.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {figures.sales.byItem.slice(0, 8).map((item) => (
                <li
                  key={item.name}
                  className="flex items-baseline justify-between gap-3 text-sm"
                >
                  <span className="min-w-0 truncate">{item.name}</span>
                  <span className="tabular-nums">
                    {formatPence(item.pence)}
                    <span className="hint ml-2">{item.count}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <p className="hint mt-2">
            Not in the figures above, which are appointments. This is the shelf &mdash;
            whether it was sold at the till or added to somebody&rsquo;s bill on the way
            out.
          </p>
        </div>
      )}

      {/*
        * What to reorder, which is the one thing on this page with a deadline.
        *
        * Only for products the shop is actually counting — a null stock means
        * they are not, and inventing a warning about a number nobody is
        * keeping would be noise on every report forever.
        *
        * Outside the counter block above, because it is true whether or not
        * anything sold this week: a shelf with one bottle left on it needs
        * reordering in a quiet week more than a busy one.
        */}
      {runningLow.length > 0 && (
        <div className="mt-6 border-t border-border pt-4">
          <div className="label">Running low</div>
          <ul className="mt-2 space-y-1.5">
            {runningLow.map((item) => (
              <li
                key={item.name}
                className="flex items-baseline justify-between gap-3 text-sm"
              >
                <span className="min-w-0 truncate">{item.name}</span>
                <span className={`tabular-nums ${item.stock === 0 ? "text-warn" : "hint"}`}>
                  {item.stock === 0 ? "none left" : `${item.stock} left`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="hint mt-4">
        Everything in the diary, whoever booked it &mdash; the assistant, you, or
        whoever answered the phone. Cancellations are left out; anything nobody turned
        up to is still counted, because the slot was lost either way.
      </p>
    </section>
  );
}
