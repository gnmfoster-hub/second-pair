/**
 * Who is asking for time, next to the diary that has the time in it.
 *
 * Giles: "the layout of the internal system, diary etc is very similar to lots
 * of systems out there. can we look at it and see where we can make
 * improvements, where can we do things better."
 *
 * He is right, and the reason is worth naming precisely. The diary is a week
 * grid with coloured blocks per person, a Day/Week/Month switch and a row of
 * people to filter by. That is Fresha, Treatwell, Timely, Booksy and a dozen
 * others, because it is the right shape for the thing they all do: showing
 * what is settled. Ours looks like theirs because it is doing their job.
 *
 * The thing this product has that none of them have is that somebody is
 * working in the diary while nobody is looking at it. Every other system's
 * diary is a record of what a human typed. This one has a second party in it,
 * holding conversations, and the whole of that was invisible: the grid showed
 * the result and nothing of the work.
 *
 * So this is the half nobody else can build — not because it is clever, but
 * because they are not having the conversation. Somebody asked for Saturday,
 * or after five in the week, and that sentence is already in the database. It
 * belongs beside the empty Saturday.
 *
 * The times are the customer's own words, on purpose. "Saturdays, or after 5
 * in the week" cannot be drawn on a grid and should not be flattened into one:
 * the shape of what somebody will accept is the useful part, and turning it
 * into a slot would throw away the half that decides whether to ring them.
 *
 * Pure, so the ordering can be tested without a diary.
 */

export type Asking = {
  conversationId: string;
  /** Their name, or whatever is known: a handle, a number, an address. */
  who: string;
  /** What they want, in the assistant's summary of it. */
  what: string | null;
  /** When they said they could come, verbatim. Null where they did not say. */
  when: string | null;
  status: string;
  /** When they last wrote. */
  at: string;
  /**
   * The business started this thread and nobody has answered it.
   *
   * Caught on the first look at the real panel: two of the seven "asking"
   * were messages the business had sent, with no reply and nothing to say
   * about time — because nobody had asked for anything. The same mistake as
   * the inbox made, one screen along, and for the same reason: a conversation
   * row says nothing about who started it unless you ask.
   */
  weWroteFirst?: boolean;
};

export type Waiting = Asking & {
  /** Somebody is waiting on a person, not on the assistant. */
  needsSomebody: boolean;
  /** Hours since they last wrote, for "waiting since Tuesday". */
  hoursWaiting: number;
};

/**
 * Which conversations count as somebody asking for time.
 *
 * Only the live ones. A booked enquiry has had its answer and belongs in the
 * grid rather than beside it; a lost one is not asking any more; spam and the
 * business's own filed post never were.
 */
const LIVE = new Set(["new", "qualified", "needs_human", "deposit_paid"]);

export function whoIsAsking(rows: Asking[], now: number = Date.now()): Waiting[] {
  return rows
    .filter((r) => LIVE.has(r.status))
    /* Somebody we wrote to, who has not replied, is not asking for anything. */
    .filter((r) => !r.weWroteFirst)
    .map((r) => ({
      ...r,
      needsSomebody: r.status === "needs_human",
      hoursWaiting: Math.max(0, Math.floor((now - Date.parse(r.at)) / 3_600_000)),
    }))
    /*
     * Whoever is waiting on a person, first, then whoever has waited longest.
     *
     * Not newest first. A list of enquiries ordered by arrival is a list where
     * the one going cold sinks — and somebody who wrote on Tuesday and has
     * heard nothing is the single most expensive thing on this screen.
     */
    .sort((a, b) => {
      if (a.needsSomebody !== b.needsSomebody) return a.needsSomebody ? -1 : 1;
      return b.hoursWaiting - a.hoursWaiting;
    });
}

/**
 * How long they have been waiting, said the way somebody would say it.
 *
 * Hours up to a day, then days. Nobody says "37 hours".
 */
export function waitedFor(hours: number): string {
  if (hours < 1) return "just now";
  if (hours === 1) return "an hour ago";
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

/**
 * The line above the list, or null when there is nobody.
 *
 * Silent rather than reassuring when nothing is waiting: a panel saying
 * "nobody is asking" on the screen somebody works in all day is furniture, and
 * the diary has enough of that already.
 */
export function askingLine(waiting: Waiting[]): string | null {
  if (waiting.length === 0) return null;

  const needing = waiting.filter((w) => w.needsSomebody).length;
  if (needing > 0) {
    return `${needing} waiting on you, ${waiting.length} asking in all`;
  }
  return waiting.length === 1 ? "1 asking about time" : `${waiting.length} asking about time`;
}
