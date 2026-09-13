/**
 * When something last saved, in words, in the right place's time.
 *
 * Two things this exists to keep consistent.
 *
 * The first is where it happens. A date turned into words in the browser is a
 * date the server rendered differently — React reports that as a hydration
 * error and the reader sees the page flicker. So every one of these is worked
 * out on the server, in the timezone of whoever is reading it.
 *
 * The second is the timezone itself. A business in London and the back office
 * looking at that same business should not disagree about when its number was
 * saved, and "18:16" meaning two different moments on two screens is the kind
 * of thing that turns a support call into an argument.
 */

/** The zone to fall back on: every business on this platform is in the UK. */
const HERE = "Europe/London";

export function savedWords(
  at: string | null | undefined,
  timezone: string | null | undefined = HERE,
): string | null {
  if (!at) return null;

  const when = new Date(at);
  if (Number.isNaN(when.getTime())) return null;

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone || HERE,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(when);
}
