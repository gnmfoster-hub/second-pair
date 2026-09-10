/**
 * Whether a conversation can simply be deleted.
 *
 * It looks like it should always be allowed — a spam enquiry, a wrong number,
 * somebody testing the widget — and for those it is. The danger is the chain
 * underneath: a conversation cascades to its enquiry, an enquiry cascades to
 * its bookings, and a booking cascades to its reminders. So deleting a thread
 * quietly takes appointments out of the diary and money out of last month's
 * takings, and nothing on screen would say a word about it.
 *
 * That exact fault has already been through this codebase once, in the erasure
 * flow, where removing somebody deleted every job they had ever had. It is
 * written down here so the second version cannot repeat it.
 *
 * A cancelled booking is not in anybody's diary and carries nothing worth
 * keeping, so it does not block.
 */

export type BookingLike = {
  starts_at: string;
  cancelled_at: string | null;
};

export type Removable =
  | { ok: true }
  | { ok: false; because: string };

export function canRemove(bookings: BookingLike[], timezone = "Europe/London"): Removable {
  const live = bookings.filter((b) => !b.cancelled_at);
  if (!live.length) return { ok: true };

  const when = live
    .map((b) => Date.parse(b.starts_at))
    .filter((ms) => Number.isFinite(ms))
    .sort((a, b) => a - b);

  /*
   * Named, rather than "this has bookings".
   *
   * Somebody looking at a thread that seems to be junk needs to know which
   * appointment they were about to remove, or they will assume the refusal is
   * wrong and go looking for a way round it.
   */
  const said = when.length
    ? new Intl.DateTimeFormat("en-GB", {
        timeZone: timezone,
        weekday: "long",
        day: "numeric",
        month: "long",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }).format(new Date(when[0]))
    : null;

  return {
    ok: false,
    because:
      live.length === 1
        ? `There is an appointment on this one${said ? ` — ${said}` : ""}. Cancel it first if it is not happening.`
        : `There are ${live.length} appointments on this one${said ? `, the first ${said}` : ""}. Cancel them first if they are not happening.`,
  };
}
