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
      return { open: false, line: `Ask now — open at ${clock(from)}` };
    }
  }

  /*
   * Shut — and this is the line that matters most, because it is the moment
   * the whole product exists for.
   *
   * The first version of this said "Closed — open tomorrow". It is true, and
   * it is exactly wrong: it tells somebody standing at the door at ten at
   * night to go away and come back, which is what every other widget on the
   * internet already does. The one that read it said it put them off using it,
   * which is the correct reaction to being told a business is shut.
   *
   * A closed business is not the failure case here. It is the case worth
   * paying for. The assistant answers, quotes and books while the owner is
   * asleep, so the line has to be an invitation — the fact that they are shut
   * is the reason to ask now, not a reason to wait.
   */
  const openAgain = nextOpening(hours, weekday);
  return {
    open: false,
    line: openAgain ? `Closed — I can still book you` : "Ask us anything",
  };
}

/** Whether the business opens again at all in the coming week. */
function nextOpening(hours: OpeningHours[], weekday: number): boolean {
  for (let ahead = 1; ahead <= 7; ahead++) {
    const day = hours.find((h) => h.day === (weekday + ahead) % 7);
    if (day && !day.closed && at(day.open) != null) return true;
  }
  return false;
}
