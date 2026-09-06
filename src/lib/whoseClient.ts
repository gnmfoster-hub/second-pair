/**
 * Which person a client is down to.
 *
 * A shared client list is right — somebody has to be able to look a customer
 * up when the person who usually sees them is off — but a list of two hundred
 * names with no idea which are yours reads as the shop's admin rather than
 * anybody's clients.
 *
 * Derived rather than stored. A client moving between people is an ordinary
 * thing in a salon, and a column saying who they "belong to" would be wrong
 * the first time it happened.
 *
 * One function because there are three places that answer this question — the
 * list, the client's own page, and the filter — and a label that disagrees
 * with the filter it sits next to is worse than no label at all. They cannot
 * drift if there is only one of them.
 */

export type Worked = { artist_id: string | null; cancelled_at: string | null; starts_at: string };
export type Asked = { artist_id: string | null; enquiries?: { artist_id: string | null } | null };

/**
 * The id of whoever a client is down to, or null when nobody is.
 *
 * Appointments first: somebody who has actually sat in a chair with them beats
 * anybody who was merely asked for. Cancelled ones do not count — that is
 * precisely the appointment that did not happen.
 */
export function whoseClient(bookings: Worked[], conversations: Asked[]): string | null {
  const worked = bookings
    .filter((b) => !b.cancelled_at && b.artist_id)
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));

  if (worked.length) return worked[worked.length - 1].artist_id;

  /*
   * Otherwise whoever was asked for. An enquiry that named Sarah, or arrived
   * on Sarah's own Instagram, is Sarah's client before a single appointment
   * exists — which is most of the list, most of the time.
   */
  const asked = conversations
    .map((c) => c.artist_id ?? c.enquiries?.artist_id ?? null)
    .filter((id): id is string => Boolean(id));

  return asked.length ? asked[asked.length - 1] : null;
}
