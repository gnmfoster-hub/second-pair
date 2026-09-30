/**
 * The ways an owner could actually answer this conversation.
 *
 * Giles, 30 Sep: "when an enquiry comes in on website and the assistant gets a
 * contact detail, can you make it so the user can pick method to respond - so
 * website, email, text - depending on the enquiry details gathered."
 *
 * ── Why the website is the channel that needs this ──────────────────────────
 *
 * Because the person is not there. They asked a question on a Tuesday evening
 * and closed the tab. Every other channel has an address that keeps working -
 * a number, an inbox, a Meta thread - and the widget has a session that ends
 * when the page does.
 *
 * So the whole point of the assistant collecting a number is that there is a way
 * back afterwards, and until now the product decided which one on the owner's
 * behalf: text first, then email, no say in it. Usually right and sometimes
 * exactly wrong. Somebody who wrote three paragraphs about a wedding wants an
 * email back, not a hundred and sixty characters. Somebody asking whether you
 * are open now wants a text.
 *
 * ── The default is what it did before ───────────────────────────────────────
 *
 * First in the returned list is what is chosen unless somebody says otherwise,
 * and for a website enquiry that is still text, then email. So nothing about
 * today's behaviour changes by adding the choice; it only becomes visible.
 *
 * ── Why it is offered on every channel and not only the website ─────────────
 *
 * Because the same question has a better answer elsewhere too. A Meta thread
 * refuses a free message twenty-four hours after the customer's last one, which
 * means the channel somebody arrived on is sometimes the one channel that cannot
 * be used - and if the assistant took a mobile number while it was talking to
 * them, a text is the difference between answering and not.
 *
 * Pure, so the rules are testable. Nothing here reaches the database or decides
 * whether a send succeeded.
 */

export type ReplyWay = {
  id: "chat" | "sms" | "email";
  /** What the owner presses. */
  label: string;
  /** Where it would go, so it can be checked before pressing send. */
  to: string | null;
  /** Said under the choice where it is worth knowing. */
  note?: string;
};

/*
 * The Meta channels, which all behave the same way for this purpose: the thread
 * is the address, and it stops accepting a free message a day after the
 * customer's last one.
 */
const META = new Set(["instagram", "whatsapp", "messenger"]);

export function waysToReply(args: {
  /** The conversation's own channel. */
  channel: string;
  /** What the assistant collected, or what the client record already held. */
  phone: string | null;
  email: string | null;
  /** The thread's own address: a number, a page-scoped id, a widget session. */
  externalRef: string | null;
  /** Whether this business can send a text at all. */
  smsReady: boolean;
  /** Whether email is configured at all. */
  emailReady: boolean;
}): ReplyWay[] {
  const { channel, phone, email, externalRef, smsReady, emailReady } = args;

  const canText = Boolean(phone && smsReady);
  const canEmail = Boolean(email && emailReady);

  const text = (): ReplyWay => ({ id: "sms", label: "Text", to: phone });
  const post = (): ReplyWay => ({ id: "email", label: "Email", to: email });

  if (channel === "web") {
    /*
     * Text, then email, then the chat window - which is the order the product
     * already used, so the default is unchanged.
     *
     * The chat is last rather than first even though it is where they asked,
     * because it is the one place they are least likely to be looking. It is
     * still offered: somebody typing in the widget right now is a real case, and
     * answering them there is instant and free.
     */
    const ways: ReplyWay[] = [];
    if (canText) ways.push(text());
    if (canEmail) ways.push(post());
    ways.push({
      id: "chat",
      label: "In the chat",
      to: externalRef,
      note: "Only seen if they still have the page open. Nothing is sent.",
    });
    return ways;
  }

  if (channel === "sms") {
    const ways: ReplyWay[] = [{ id: "sms", label: "Text", to: externalRef ?? phone }];
    if (canEmail) ways.push(post());
    return ways;
  }

  if (channel === "email") {
    const ways: ReplyWay[] = [{ id: "email", label: "Email", to: externalRef ?? email }];
    if (canText) ways.push(text());
    return ways;
  }

  if (META.has(channel)) {
    /*
     * The thread first, and the other ways beside it.
     *
     * Meta refuses a free-form message more than twenty-four hours after the
     * customer's last one. This helper does not know how long ago that was -
     * deliver does, and says so when it refuses - but it is exactly why a number
     * taken during the conversation is worth offering here.
     */
    const ways: ReplyWay[] = [
      {
        id: "chat",
        label: channel === "whatsapp" ? "WhatsApp" : channel === "messenger" ? "Messenger" : "Instagram",
        to: externalRef,
        note: "Refused by Facebook more than a day after their last message.",
      },
    ];
    if (canText) ways.push(text());
    if (canEmail) ways.push(post());
    return ways;
  }

  /*
   * Anything else - a channel added later, or a conversation with none recorded.
   *
   * Whatever can actually be reached, rather than an empty list: an empty one
   * would hide the reply box on a conversation somebody can plainly answer.
   */
  const ways: ReplyWay[] = [];
  if (canText) ways.push(text());
  if (canEmail) ways.push(post());
  if (ways.length === 0) ways.push({ id: "chat", label: "Save it here", to: externalRef });
  return ways;
}

/**
 * Whether the choice is worth showing at all.
 *
 * One way is not a choice, and a row of one button that cannot be changed is
 * furniture. The reply box asks this rather than counting, so the rule lives
 * with the rest of them.
 */
export const worthChoosing = (ways: ReplyWay[]) => ways.length > 1;
