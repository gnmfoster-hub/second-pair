/**
 * How a form actually reached somebody — or whether it reached them at all.
 *
 * `client_forms.sent_via` has recorded this since forms were built and nothing
 * has ever read it. Found by auditing the database for columns the product
 * stores and never reads, which is the same sweep that found the margin and
 * the call figures.
 *
 * The reason it matters is not the label. It is that "link" is not a way of
 * sending anything.
 *
 * When a form is made without a route to the customer — no mobile number, no
 * email, or the person making it just wanted a URL — the row is written with
 * status "sent" and `sent_via: "link"`, and a link is put on the screen for
 * somebody to pass on by hand. Nothing goes anywhere. But the screen read the
 * status and said "Sent 3 Oct · not opened yet", which is two false statements
 * in one line: it was not sent, and "not opened yet" implies somebody is being
 * slow when in fact nobody was ever given it.
 *
 * Latent rather than currently visible, and worth being exact about it: seven
 * of the nine forms in the live database went out this way, and all seven were
 * opened or signed — somebody did pass the link on. So nothing is wearing the
 * wrong label today. The first form made for a contact with no number and no
 * address will be, and that is the ordinary case for a walk-in.
 *
 * So this says what happened. A form waiting for somebody to hand the link
 * over is a job on a person's list, not a customer failing to respond, and
 * those two things should never look the same.
 */

/** What is known about how a form left. Null on rows written before this. */
export type SentVia = string | null;

/**
 * True when nothing was actually sent to the customer.
 *
 * The one distinction the screen has to get right: everything else is a
 * wording preference, this one is the difference between waiting on a customer
 * and waiting on yourself.
 */
export function wentNowhere(sentVia: SentVia): boolean {
  return sentVia === "link";
}

/**
 * How it went, in the fewest words that are true.
 *
 * Returns an empty string when there is nothing worth saying — an unknown
 * route on an old row, where guessing would be worse than silence.
 */
export function howItWent(sentVia: SentVia): string {
  switch (sentVia) {
    case "sms":
      return "by text";
    case "email":
      return "by email";
    case "whatsapp":
      return "on WhatsApp";
    case "instagram":
      return "on Instagram";
    case "facebook":
      return "on Facebook";
    case "web":
      return "on the website";
    /*
     * The assistant handed it over mid-conversation, which is its own thing:
     * it did go to the customer, on whatever channel they were already using,
     * and naming that channel here would mean storing it twice.
     */
    case "assistant":
      return "in the conversation";
    case "link":
      /* Deliberately empty. wentNowhere covers this, and the caller says
         something quite different rather than appending a phrase. */
      return "";
    default:
      return "";
  }
}

/**
 * The whole line under a form's title.
 *
 * Kept here rather than in the component so the wording can be tested without
 * a database or a browser, and so the one case that matters — a link nobody
 * has passed on — cannot quietly go back to reading like a sent form.
 */
export function formLine(f: {
  status: string;
  sentVia: SentVia;
  sentAt: string | null;
  openedAt: string | null;
  signedAt: string | null;
  createdAt: string;
  /** Injected so the wording can be tested without a clock or a locale. */
  day?: (iso: string | null) => string;
}): string {
  const day =
    f.day ??
    ((iso: string | null) =>
      iso
        ? new Date(iso).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })
        : "");

  if (f.status === "signed") return `Signed ${day(f.signedAt)}`;
  if (f.status === "paper") return `Kept ${day(f.signedAt ?? f.createdAt)}`;

  /*
   * Opened or signed means it plainly did reach them, whatever the row says
   * about how — somebody with the link used it. Saying "not sent" over the top
   * of evidence that it arrived would be the same mistake the other way round.
   */
  if (f.status === "opened") {
    const how = howItWent(f.sentVia);
    return `Opened ${day(f.openedAt)}${how ? ` · sent ${how}` : ""} · not signed yet`;
  }

  if (wentNowhere(f.sentVia)) {
    return `Link made ${day(f.sentAt ?? f.createdAt)} · not sent to anyone yet`;
  }

  const how = howItWent(f.sentVia);
  return `Sent${how ? ` ${how}` : ""} ${day(f.sentAt ?? f.createdAt)} · not opened yet`;
}
