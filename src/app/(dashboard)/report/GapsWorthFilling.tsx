import { saidAsTime } from "@/lib/freeSlots";

export type OpenSlot = {
  artistId: string;
  who: string;
  /** The day, as words: "Thursday 18 Sept". */
  day: string;
  from: number;
  to: number;
  minutes: number;
};

/**
 * The gaps in the week ahead that are worth selling.
 *
 * The other half of "who hasn't been back". That list gives a salon people to
 * ring; this one gives them something to offer — and the two together are the
 * whole of what a quiet week needs, which is otherwise a thing an owner
 * worries about on a Sunday and cannot act on.
 *
 * Only what is genuinely sellable: a gap has to be long enough to put the
 * shortest thing on the price list into it. Ten minutes between a cut and a
 * colour is how a day is supposed to breathe, and reporting it would bury the
 * hour and a half on Thursday that means something.
 *
 * Deliberately the week ahead rather than the week on screen. Somebody looking
 * at last week's figures cannot do anything about last week's empty afternoons.
 */
export function GapsWorthFilling({
  slots,
  hours,
}: {
  slots: OpenSlot[];
  /** What it all comes to, so the size of it lands before the detail. */
  hours: number;
}) {
  if (slots.length === 0) return null;

  return (
    <section className="mt-8">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="section-title">The gaps worth filling</h2>
        <span className="hint tabular-nums">
          {hours} {hours === 1 ? "hour" : "hours"} free
        </span>
      </div>

      <p className="hint mt-1 max-w-prose">
        Holes in days somebody is already working, long enough to sell. The few minutes
        between appointments are left out &mdash; that is how a day breathes &mdash; and
        so are days that are empty from end to end, which are a different conversation.
      </p>

      <ul className="mt-3 space-y-1.5">
        {slots.slice(0, 12).map((slot) => (
          <li
            key={`${slot.artistId}-${slot.day}-${slot.from}`}
            className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 rounded-lg px-3 py-2 odd:bg-surface-2/40"
          >
            <span className="font-medium">{slot.day}</span>
            <span className="tabular-nums">
              {saidAsTime(slot.from)} &ndash; {saidAsTime(slot.to)}
            </span>
            <span className="hint">with {slot.who}</span>
            <span className="hint ml-auto tabular-nums">
              {slot.minutes >= 60
                ? `${Math.floor(slot.minutes / 60)}h${slot.minutes % 60 ? ` ${slot.minutes % 60}m` : ""}`
                : `${slot.minutes}m`}
            </span>
          </li>
        ))}
      </ul>

      {slots.length > 12 && (
        <p className="hint mt-2">And {slots.length - 12} more across the week.</p>
      )}
    </section>
  );
}
