import type { OpeningHours } from "./types";

/**
 * What the launcher says about itself, before anybody has clicked it.
 *
 * Every chat widget on the internet is a silent circle in the corner. It tells
 * a visitor nothing, and it is identical on every site it appears on.
 *
 * The whole promise of this product is that somebody answers while the owner
 * is working — including at ten at night when the salon is shut and every
 * competitor's widget is a mute bubble that will email somebody in the
 * morning. That is worth saying out loud at the moment a visitor is deciding
 * whether to bother asking.
 *
 * It has to be true, which is why it is computed from the business's own hours
 * in its own timezone rather than being a slogan. "Answering now" when nobody
 * is, is worse than saying nothing.
 */

export type Status = {
  open: boolean;
  /** One short line. Shown beside the mark, so it has to fit. */
  line: string;
};

/** Minutes since midnight where the business is, for a given instant. */
function localMinutes(at: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(at);
  const got = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return (Number(got.hour) % 24) * 60 + Number(got.minute);
}

/** Which day of the week it is where the business is. */
function localWeekday(at: Date, timezone: string): number {
  const name = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, weekday: "short" }).format(at);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(name);
}

const clock = (minutes: number): string => {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const suffix = h < 12 ? "am" : "pm";
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${twelve}${suffix}` : `${twelve}.${String(m).padStart(2, "0")}${suffix}`;
};

function at(hhmm: string): number | null {
  const [h, m] = hhmm.split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
}

export function statusFor(
  hours: OpeningHours[] | null | undefined,
  timezone: string,
  now: Date,
): Status {
  /*
   * No hours set is not "closed", it is "we do not know".
   *
   * A business still setting itself up would otherwise have every visitor told
   * it was shut, which is both untrue and the worst possible first impression
   * on the day somebody is trying the product out.
   */
  if (!hours?.length) return { open: false, line: "Ask us anything" };

  const weekday = localWeekday(now, timezone);
  const minutes = localMinutes(now, timezone);
  const today = hours.find((h) => h.day === weekday);

  if (today && !today.closed) {
    const from = at(today.open);
    const to = at(today.close);
    if (from != null && to != null && to > from && minutes >= from && minutes < to) {
      return { open: true, line: "Answering now" };
    }
    // Open later today.
    if (from != null && minutes < from) {
      return { open: false, line: `Back at ${clock(from)} — ask now` };
    }
  }

  /*
   * Shut, which is the case this exists for.
   *
   * Naming the next opening is the difference between "come back later" and
   * "I know when they are in, and I can still book you". Looks forward a whole
   * week so a business closed Sunday and Monday still says something useful.
   */
  for (let ahead = 1; ahead <= 7; ahead++) {
    const day = hours.find((h) => h.day === (weekday + ahead) % 7);
    if (!day || day.closed) continue;
    const from = at(day.open);
    if (from == null) continue;
    const when = ahead === 1 ? "tomorrow" : dayName((weekday + ahead) % 7);
    return { open: false, line: `Closed — open ${when}` };
  }

  return { open: false, line: "Ask us anything" };
}

function dayName(day: number): string {
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][day];
}
