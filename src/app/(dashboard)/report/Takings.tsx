import { formatPence } from "@/lib/money";
import type { Margin } from "@/lib/margin";
import { colourFor } from "@/components/Avatar";
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
  margin = null,
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
  /** What was sold over the counter and what it made. Null where nothing was. */
  margin?: Margin | null;
}) {
  /*
   * A quiet week is not an empty section.
   *
   * This used to be `if (figures.bookings === 0) return null`, which took the
   * counter sales and the running-low shelf out with it — in the one week they
   * matter most. The comment on runningLow already said so in as many words:
   * "a shelf with one bottle left needs reordering in a quiet week more than a
   * busy one", and then the line above deleted it in a quiet week.
   *
   * Found while proving the margin figure worked: the demo's last week had
   * four bottles of shampoo sold against a cost and showed no margin at all,
   * because nobody had an appointment. A shop that retails through a slow week
   * is a real shop, and it is the one asking what the retail made.
   *
   * So the section appears if it has anything to say, and each part of it
   * appears if it has anything to say.
   */
  const bookings = figures.bookings > 0;
  const hasMargin = Boolean(margin && margin.lines.length > 0);
  if (!bookings && !hasMargin && runningLow.length === 0) return null;

  const most = figures.byPerson[0]?.pence ?? 0;

  return (
    <section className="card mt-4 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        {/* Not "Over the counter", which is the name of a block further down
            this same card. Two headings with one name in one card is how
            somebody reads the wrong figure. */}
        <h2 className="section-title">{bookings ? "What it came to" : "What the week made"}</h2>
        {bookings && (
          <span className="hint tabular-nums">
            {/* "1 appointments" was on the report until a check went looking
                for short labels wrapping in fixed boxes and found this one
                taking two lines to be wrong. */}
            {figures.bookings} {figures.bookings === 1 ? "appointment" : "appointments"}
          </span>
        )}
      </div>

      {bookings && (
        <div className="mt-1 text-2xl font-semibold tabular-nums">
          {formatPence(figures.pence)}
        </div>
      )}

      {/*
       * Said plainly, because the total is wrong by exactly this much and
       * somebody comparing it against their own takings deserves to know why
       * rather than concluding the product cannot count.
       */}
      {bookings && figures.unpriced > 0 && (
        <p className="hint mt-1">
          {figures.unpriced} of them have no price on, so they are counted as
          appointments and not as money.
        </p>
      )}

      {/*
       * Said once, where a week with no appointments would otherwise open on a
       * retail figure and leave somebody wondering what happened to the rest.
       */}
      {!bookings && (
        <p className="hint mt-1">
          Nothing in the diary for this range, so this is what went over the counter.
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
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2">
              {/*
                * Each person's own colour, the one they already have.
                *
                * Every bar was the same cobalt, so six bars said only "these
                * are quantities" — and the product already gives everybody a
                * colour that follows them: their avatar on the inbox, their
                * appointments in the diary, their column in the week. Using it
                * here costs nothing and makes the row scannable by person
                * rather than only by length. Giles asked whether the palette
                * was being used; this is it being used for the thing it is.
                */}
              <div
                className="h-full rounded-full"
                style={{
                  width: most > 0 ? `${(person.pence / most) * 100}%` : "0%",
                  background: colourFor(person.name),
                  opacity: 0.92,
                }}
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
        * What the things you sell actually make you.
        *
        * Takings are the wrong number for retail and the only one this report
        * had: £200 of product at 62% and £200 at 15% are the same line here
        * and are not remotely the same week. Somebody deciding whether to keep
        * stocking a thing needs the difference.
        *
        * Found by auditing the database for columns the product stores and
        * never reads. cost_pence has been on services for weeks, filled in on
        * real products, and had never once reached a screen.
        *
        * Shown only where a cost is actually known. A shop that has never
        * filled it in sees nothing rather than a margin of 100%, which is what
        * an empty cost column produces and is a lie with a decimal point on it.
        */}
      {margin && margin.lines.length > 0 && (
        <div className="mt-6 border-t border-border pt-4">
          <div className="label">What you made on what you sold</div>

          <div className="mt-2 flex flex-wrap items-baseline gap-x-5 gap-y-1">
            <span className="text-sm">
              <span className="num">{formatPence(margin.tookPence)}</span>
              <span className="hint ml-1.5">taken</span>
            </span>
            <span className="text-sm">
              <span className="num">{formatPence(margin.costPence)}</span>
              <span className="hint ml-1.5">cost you</span>
            </span>
            <span className="text-sm">
              <span className="num font-medium text-ok">{formatPence(margin.madePence)}</span>
              <span className="hint ml-1.5">
                made{margin.percent === null ? "" : ` · ${margin.percent}%`}
              </span>
            </span>
          </div>

          <ul className="mt-3 space-y-1.5">
            {margin.lines.slice(0, 6).map((line) => (
              <li key={line.name} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">
                  {line.name}
                  <span className="hint ml-2">{line.sold}</span>
                </span>
                <span className="tabular-nums">
                  {formatPence(line.madePence)}
                  {line.percent !== null && <span className="hint ml-2">{line.percent}%</span>}
                </span>
              </li>
            ))}
          </ul>

          {/*
            * Said rather than silently excluded. A figure that quietly leaves
            * half the sales out is worse than no figure, and the fix — put a
            * cost against the thing — is something only they can do.
            */}
          {margin.unknown > 0 && (
            <p className="hint mt-2">
              {margin.unknown} other {margin.unknown === 1 ? "line has" : "lines have"} no cost
              price against {margin.unknown === 1 ? "it" : "them"}, so {margin.unknown === 1 ? "it is" : "they are"} left
              out of these figures.
            </p>
          )}
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
          {/* "out of £0 booked" is a sentence about nothing. In a week with no
              appointments, what was taken stands on its own. */}
          <p className="hint mt-1">
            Paid for and closed off
            {bookings ? `, out of ${formatPence(figures.pence)} booked` : ""}. Cash, a
            card machine, a phone or a link, all of it.
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
            {bookings ? "Not in the figures above, which are appointments. This" : "This"} is the
            shelf, whether it was sold at the till or added to somebody&rsquo;s bill on the way
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

      {/* What counts as an appointment, which is only worth saying when there
          are appointments. With none, it sat under the shelf explaining a
          figure that was not on the page. */}
      {bookings && (
        <p className="hint mt-4">
          Everything in the diary, whoever booked it, the assistant, you, or
          whoever answered the phone. Cancellations are left out; anything nobody turned
          up to is still counted, because the slot was lost either way.
        </p>
      )}
    </section>
  );
}
