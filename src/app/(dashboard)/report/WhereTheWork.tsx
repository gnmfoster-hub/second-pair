import { formatPence } from "@/lib/money";
import { plural } from "@/lib/words";
import type { Area, Running } from "@/lib/reportShape";

/**
 * Where the week's work was, and whether it ran to time.
 *
 * Neither question exists in a salon, which is why neither was on this page.
 * A business that drives to people wants to know which towns are paying for
 * the diesel — six small jobs one side of the city and one big one the other
 * is a fact about where to advertise. And a trade quoting by the hour wants
 * to know whether the hour is right: half an hour over on every job is a day
 * a month, given away without anybody deciding to.
 *
 * Each half appears only when it has something to say. A business whose
 * customers come to it never sees the map, and one where nobody records how
 * long a job took never sees the timing — an empty panel teaches people to
 * stop reading the page.
 */
export function WhereTheWork({
  areas,
  unknown,
  running,
  words,
}: {
  areas: Area[];
  /** Jobs with no postcode on them, so the list is not read as everything. */
  unknown: number;
  running: Running;
  words: { service: string; services?: string };
}) {
  const showAreas = areas.length > 0;
  const showRunning = running.measured >= 3;
  if (!showAreas && !showRunning) return null;

  const jobs = words.services ?? plural(words.service);
  const most = areas[0]?.pence ?? 0;

  return (
    <div className="mt-6 grid gap-4 md:grid-cols-2">
      {showAreas && (
        <section className="card p-5">
          <div className="section-title">Where the work was</div>
          <p className="hint mt-1">
            By what it came to, not how many, because one big job pays for a lot of small ones.
          </p>

          <ul className="mt-4 space-y-2.5">
            {areas.map((area) => (
              <li key={area.area}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-medium">{area.area}</span>
                  <span className="num tabular-nums">{formatPence(area.pence)}</span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${most > 0 ? Math.max(4, (area.pence / most) * 100) : 0}%` }}
                    />
                  </div>
                  <span className="hint shrink-0 text-xs">
                    {area.jobs} {area.jobs === 1 ? words.service : jobs}
                  </span>
                </div>
              </li>
            ))}
          </ul>

          {unknown > 0 && (
            <p className="hint mt-3 text-xs">
              {unknown} more with no postcode on them, and those booked by hand usually have
              none, so this is the work that came in through the assistant.
            </p>
          )}
        </section>
      )}

      {showRunning && (
        <section className="card p-5">
          <div className="section-title">Did they run to time?</div>
          <p className="hint mt-1">
            From the length recorded when a {words.service} is closed off, against what it
            was booked for.
          </p>

          <div className="mt-4 flex items-baseline gap-2">
            <span
              className={`text-3xl font-semibold tabular-nums ${
                running.typicalMinutes > 5 ? "text-warn" : "text-ok"
              }`}
            >
              {running.typicalMinutes > 0 ? "+" : ""}
              {running.typicalMinutes}
            </span>
            <span className="hint">minutes, usually</span>
          </div>

          <p className="mt-2 max-w-prose text-sm">
            {running.typicalMinutes > 5 ? (
              <>
                The usual {words.service} runs over. Booking that time in is the difference
                between a day that works and one that is late by the afternoon.
              </>
            ) : running.typicalMinutes < -5 ? (
              <>
                They finish early. You could fit more in, or quote less time and win more of
                the work.
              </>
            ) : (
              <>Your times are about right, which is worth knowing when somebody asks.</>
            )}
          </p>

          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            {[
              ["Over", running.over, "text-warn"],
              ["On time", running.onTime, "text-ok"],
              ["Under", running.under, "text-muted"],
            ].map(([label, count, tone]) => (
              <div key={String(label)} className="rounded-lg bg-surface-2 p-2.5">
                <div className={`text-lg font-semibold tabular-nums ${tone}`}>{String(count)}</div>
                <div className="hint text-xs">{label}</div>
              </div>
            ))}
          </div>

          <p className="hint mt-3 text-xs">
            Out of {running.measured} closed off with a real length. Five minutes either way
            counts as on time.
          </p>
        </section>
      )}
    </div>
  );
}
