/**
 * Whether the assistant has ever answered this person before.
 *
 * It decides one thing: whether the next reply carries the line saying they are
 * talking to an assistant. That line is a legal requirement rather than a
 * stylistic preference, and the cost of getting this wrong is somebody holding
 * a conversation with something they were never told was not a person.
 *
 * The rule used to be "has the assistant said anything in this thread", which
 * was right until something else started writing as the assistant. A reminder
 * the evening before an appointment is recorded with the assistant's name on
 * it, so a client who had never met the assistant, replying to that reminder,
 * was answered with no disclosure at all.
 *
 * That is not a hypothetical thread. A regular booked over the counter has no
 * conversation, gets a reminder, and texts back "can we make it half four" —
 * and until this, the reply to that was the first thing the assistant had ever
 * said to them and it introduced itself as nobody.
 *
 * So the question is not whether the assistant has spoken. It is whether it has
 * ever *answered* them: an assistant message with something they said before
 * it. A reminder, a review ask and a note from the owner all come first and
 * answer nothing, so none of them stands in for an introduction.
 */
export type Said = { role: string };

export function isFirstReply(inOrder: Said[]): boolean {
  let heardFromThem = false;

  for (const message of inOrder) {
    if (message.role === "client") {
      heardFromThem = true;
      continue;
    }
    // An assistant message with something of theirs before it is a reply, and
    // the first one of those is where the introduction belongs.
    if (message.role === "assistant" && heardFromThem) return false;
  }

  return true;
}
