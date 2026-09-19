/**
 * Who a connected channel belongs to, and what that decides.
 *
 * channel_connections has carried an artist_id since the day it was written,
 * and the comment on that column has always said what it means: null and the
 * connection belongs to the business, so the assistant asks who they would
 * like; set, and every enquiry arriving there is for that person and it must
 * never ask.
 *
 * Everything downstream already honours it. What has never existed is any way
 * to decide it — every connection ever made has been the business's, because
 * that is what an insert with no artist_id produces.
 *
 * This is the rules half of giving it away, kept apart from the database so it
 * can be tested without one. It applies to every channel, because the column
 * does: a number, an Instagram account and a Facebook page are all a way for
 * one person to be reached, and a business that gives a stylist her own
 * Instagram will want to give her her own number eventually too.
 */

export type Whose =
  /** The business's. The assistant asks who the customer would like. */
  | { kind: "business" }
  /** One person's. Every enquiry here is theirs, and it never asks. */
  | { kind: "person"; artistId: string };

export type Person = { id: string; name: string; active: boolean };

export type Refusal = { ok: false; because: string };
export type Allowed = { ok: true; artistId: string | null };

/**
 * Whether a channel may be given to somebody, and why not.
 *
 * Deliberately a few plain rules rather than a permission system. The whole
 * risk here is sending a customer to a diary that cannot take them.
 */
export function mayAllocate(
  whose: Whose,
  people: Person[],
  /** How many connections this business has on this channel. */
  othersOnChannel: number,
): Allowed | Refusal {
  if (whose.kind === "business") return { ok: true, artistId: null };

  const person = people.find((p) => p.id === whose.artistId);
  if (!person) {
    return { ok: false, because: "That person is not on this business." };
  }

  /*
   * Somebody who has left keeps nothing pointed at them.
   *
   * An inactive person is off the diary and out of the list the assistant
   * offers, so a channel routed to them is a line that rings a chair nobody
   * sits in — and the assistant would never ask, because it has been told it
   * already knows whose enquiry this is.
   */
  if (!person.active) {
    return { ok: false, because: `${person.name} is not working here at the moment.` };
  }

  /*
   * The last one cannot be given away.
   *
   * A business with one number that belongs to one stylist has no way for a
   * new customer to reach the business at all: every text goes to her, and
   * nobody else is ever offered. That is a decision somebody might genuinely
   * want, but not one to arrive at by accident on the only line they have.
   */
  if (othersOnChannel <= 1) {
    return {
      ok: false,
      because:
        "This is the only one on this channel. Give the business a second before giving this one to somebody.",
    };
  }

  return { ok: true, artistId: person.id };
}

/**
 * What to tell somebody about a connection they are looking at.
 *
 * The difference is not cosmetic and is easy to miss: on a shared line the
 * assistant asks who they want, and on somebody's own it never does. Said in
 * those terms rather than as "assigned to".
 */
export function describe(artistId: string | null, people: Person[]): string {
  if (!artistId) return "The whole business — the assistant asks who they would like";
  const person = people.find((p) => p.id === artistId);
  if (!person) return "Somebody who is no longer on this business";
  return `${person.name} — everything here is theirs, and it never asks who`;
}

/**
 * Whether this person may have their own of a channel at all.
 *
 * The decision that comes before allocating anything, and the one an owner
 * actually makes: a salon decides senior stylists take their own bookings on
 * their own Instagram and the apprentice does not, and it decides that before
 * anybody connects a thing.
 *
 * Absent means none. Every business is in that state today, so nothing changes
 * for anybody until an owner ticks something — and the business's own channels
 * go on reaching everybody either way, which is the part that matters and the
 * part people assume this turns off.
 */
export function mayHaveTheirOwn(
  allowedForThem: string[] | null | undefined,
  channel: string,
): boolean {
  return (allowedForThem ?? []).includes(channel);
}

/**
 * What the owner is actually deciding, in the words it changes.
 *
 * Written once so the owner's screen and the person's screen cannot describe
 * the same switch differently — which is how somebody ends up believing a
 * stylist has been cut off from the business's number.
 */
export function whatAllowingMeans(channel: string, firstName: string): string {
  if (channel === "sms" || channel === "voice") {
    return `${firstName} can be given a number of their own, once one has been bought. Until then the business's number still reaches them.`;
  }
  if (channel === "instagram" || channel === "messenger") {
    return `${firstName} can connect their own account from their settings. Only they can log in to it, so only they can do it.`;
  }
  if (channel === "email") {
    return `${firstName} has an address of their own that reaches only them.`;
  }
  return `${firstName} can have their own on this channel.`;
}
