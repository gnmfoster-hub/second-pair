/**
 * What this business already knows about the person writing in.
 *
 * Giles, 22 October: "can we review how we deal with returning customers,
 * both who are booked and not booked."
 *
 * Until now the answer was the same for both: as strangers. Every turn of
 * every conversation was handed the enquiry attached to *that conversation*
 * and nothing else, so a customer who had booked an hour earlier, or came
 * every six weeks for two years, arrived with a blank sheet.
 *
 * Jess at Living Canvas is the whole argument in one morning. She spent four
 * minutes on the website giving her name, her size, her placement, her age
 * and two reference photos, and booked. The next day she replied by email
 * and was asked for her name, her size, her placement, her age and a photo.
 * She answered all of it again, politely, and then wrote: "I thought the
 * photo was already attached, did you not get it."
 *
 * Nothing was broken. Nobody had written this file.
 *
 *
 * Two things, kept apart on purpose
 * ---------------------------------
 *
 * What they have booked is a fact about the diary, and it has to be right:
 * an assistant that invents an appointment is worse than one that knows of
 * none. So it is read fresh every turn and only ever states what the row
 * says.
 *
 * What they said elsewhere is softer. It is their own words from another
 * thread, and its job is only to stop the assistant asking a second time. It
 * is offered as something already known, never as something to recite back.
 *
 *
 * Why it is a note and not a merge
 * --------------------------------
 *
 * The obvious fix is to pour the other conversation's answers into this
 * one's enquiry row. That would be wrong twice: the tools read that row to
 * decide what to quote and how long to book, and a placement typed about a
 * different tattoo would silently become the one being priced. And nobody
 * reading the transcript afterwards could tell which answers came from this
 * conversation and which were carried in.
 *
 * So it stays a note, in plain words, visible to anybody who reads the
 * thread back.
 */

import { formatPence } from "../money.ts";

export type TheirBooking = {
  startsAt: string;
  endsAt?: string | null;
  title?: string | null;
  /** Whoever it is with, where the business has people. */
  withWhom?: string | null;
  depositOwedPence?: number | null;
  attended?: boolean | null;
};

export type SaidElsewhere = {
  channel: string;
  /** When they last wrote on that thread. */
  at: string;
  /** The enquiry from that thread, as short phrases already in their words. */
  facts: string[];
};

export type TheirHistory = {
  name?: string | null;
  /** Not cancelled, still to come. Soonest first. */
  coming: TheirBooking[];
  /** The last one that happened. */
  lastVisit?: TheirBooking | null;
  /** How many have happened in all, however long ago. */
  visits: number;
  elsewhere: SaidElsewhere[];
  /**
   * Whether this business's assistant has introduced itself to them before.
   *
   * Not a nicety. The disclosure at the top of a first reply is there because
   * Article 13 wants somebody told whose data this is and what it is for, at
   * the point it is collected. It was counted per thread, so Jess was told
   * twice in four minutes: once on the website and again when she replied to
   * her own confirmation email. Said to a stranger it is the law; said to
   * somebody you spoke to a minute ago it reads as not knowing who they are.
   *
   * Only suppressed where the earlier conversation is recent enough that they
   * could reasonably remember it. A year on, telling them again is right.
   */
  metBefore: boolean;
};

function when(iso: string, timeZone: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
    .format(new Date(t))
    .replace(/:00(?=\s?[ap]m)/i, "")
    .replace(/\s?(am|pm)/i, (m) => m.trim().toLowerCase());
}

function day(iso: string, timeZone: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "numeric",
    month: "long",
  }).format(new Date(t));
}

/**
 * The block that goes into the prompt, or nothing at all.
 *
 * Empty for a genuine stranger, which is most people, so the prompt does not
 * grow a heading saying they have no history. An empty string is the signal
 * to leave it out entirely.
 */
export function theirHistoryNote(history: TheirHistory, timeZone: string): string {
  const lines: string[] = [];

  if (history.coming.length) {
    lines.push(
      history.coming.length === 1
        ? "This person already has an appointment booked:"
        : "This person already has appointments booked:",
    );
    for (const b of history.coming) {
      const bits = [when(b.startsAt, timeZone)];
      if (b.withWhom) bits.push(`with ${b.withWhom}`);
      if (b.title?.trim()) bits.push(`(${b.title.trim()})`);
      let line = `- ${bits.join(" ")}`;
      if ((b.depositOwedPence ?? 0) > 0) {
        line += `. A deposit of ${formatPence(b.depositOwedPence as number)} is still owed on it.`;
      }
      lines.push(line);
    }
    lines.push(
      "Take it as read that they know about it. Do not offer to book them in for " +
        "something they already have, and do not ask when they would like to come.",
    );
  }

  if (history.visits > 0) {
    const been =
      history.visits === 1
        ? "They have been in once before"
        : `They have been in ${history.visits} times before`;
    lines.push(
      history.lastVisit
        ? `${been}, most recently on ${day(history.lastVisit.startsAt, timeZone)}. ` +
            "They are a returning customer, so greet them as one."
        : `${been}. They are a returning customer, so greet them as one.`,
    );
  }

  for (const said of history.elsewhere) {
    if (!said.facts.length) continue;
    lines.push(
      `They have already told us this, on ${said.channel === "web" ? "the website" : said.channel} ` +
        `on ${day(said.at, timeZone)}: ${said.facts.join("; ")}.`,
    );
  }

  if (history.elsewhere.some((e) => e.facts.length)) {
    lines.push(
      "Do not ask for any of that again. If something has changed they will say so. " +
        "Where you genuinely need to check one of them, check it in a line rather than " +
        "asking from scratch.",
    );
  }

  if (!lines.length) return "";

  return ["What this business already knows about them:", ...lines].join("\n");
}
