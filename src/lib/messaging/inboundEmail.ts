/**
 * Deciding whether an email is a customer, and what to do when it is not.
 *
 * Every other channel is safe by default. A text message is from a person who
 * wanted this business; so is a WhatsApp, so is somebody opening the widget.
 * Email is the opposite: most of what arrives at a small business is not a
 * customer at all. It is the wholesaler, the accountant, an invoice, four
 * newsletters, a delivery notice, HMRC, and a great deal of spam. An assistant
 * that answered all of it would be worse than no assistant.
 *
 * So the burden of proof turns over. Everywhere else we answer unless there is
 * a reason not to; here we stay quiet unless there is a reason to speak, and
 * anything uncertain goes to the owner unanswered rather than being guessed
 * at. A missed customer costs a booking. A cheerful reply to somebody's
 * solicitor costs a great deal more.
 *
 * Three outcomes, not two:
 *
 *   answer  a person, writing to this business, who appears to want something
 *   park    a person, but not one to reply to without a human looking first
 *   ignore  not a person at all, and nothing that should ever be answered
 *
 * The difference between park and ignore matters. Parking puts it in the inbox
 * where somebody sees it; ignoring puts a newsletter there every Tuesday until
 * the inbox is useless.
 */

export type InboundEmail = {
  from: string;
  to?: string | null;
  subject?: string | null;
  body?: string | null;
  /** Lower-cased header names to values, as the provider gave them. */
  headers?: Record<string, string>;
};

export type Verdict = {
  what: "answer" | "park" | "ignore";
  /** Said in the owner's terms, for the note in the inbox. */
  because: string;
};

/** Addresses that exist to send and never to receive. */
const NEVER_REPLY = /^(no[-_.]?reply|do[-_.]?not[-_.]?reply|bounce|mailer-daemon|postmaster|abuse|notifications?|alerts?|billing|invoices?)@/i;

/** Subjects a mail system writes, not a person. */
const MACHINE_SUBJECT =
  /^(undeliverable|delivery status notification|mail delivery|returned mail|automatic reply|out of office|auto(matic)?[- ]?reply|read receipt)/i;

const address = (raw: string): string => {
  const angled = /<([^>]+)>/.exec(raw);
  return (angled ? angled[1] : raw).trim().toLowerCase();
};

/** The bit after the @, or "" if there is not one. */
export function domainOf(raw: string): string {
  const at = address(raw).lastIndexOf("@");
  return at === -1 ? "" : address(raw).slice(at + 1);
}

/**
 * Whether this is a machine talking.
 *
 * Every one of these is a header a mail system sets on its own behalf, and
 * replying to any of them risks two robots writing to each other until
 * somebody notices. That is not a theoretical failure — it is the oldest one
 * there is, and the reason these headers exist.
 */
function fromAMachine(headers: Record<string, string>): string | null {
  const auto = headers["auto-submitted"];
  if (auto && auto.trim().toLowerCase() !== "no") return "it is an automatic message";

  const precedence = (headers["precedence"] ?? "").trim().toLowerCase();
  if (["bulk", "list", "junk", "auto_reply"].includes(precedence)) {
    return "it was sent to a mailing list";
  }

  if (headers["list-unsubscribe"] || headers["list-id"]) return "it is a mailing list";
  if (headers["x-autoreply"] || headers["x-autorespond"]) return "it is an automatic reply";

  return null;
}

export function judge(
  email: InboundEmail,
  business: { ownDomains?: string[]; ourDomain?: string } = {},
): Verdict {
  const headers = Object.fromEntries(
    Object.entries(email.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
  );

  const machine = fromAMachine(headers);
  if (machine) return { what: "ignore", because: machine };

  const from = address(email.from ?? "");
  if (!from || !from.includes("@")) {
    return { what: "ignore", because: "there is no sender to reply to" };
  }

  if (NEVER_REPLY.test(from)) {
    return { what: "ignore", because: "it came from an address that does not take replies" };
  }

  const subject = (email.subject ?? "").trim();
  if (MACHINE_SUBJECT.test(subject)) {
    return { what: "ignore", because: "it is an automatic notice rather than a message" };
  }

  const sender = domainOf(from);

  /*
   * Us, writing to ourselves.
   *
   * The reply goes out from our own domain, so without this a misconfigured
   * forwarding rule loops it straight back in and the assistant answers its
   * own message, forever, at a pound a time.
   */
  if (business.ourDomain && sender === business.ourDomain.toLowerCase()) {
    return { what: "ignore", because: "it came from this assistant" };
  }

  /*
   * The business, or somebody who works there.
   *
   * Not a customer, and answering it would mean writing to the owner in their
   * own voice about their own enquiry. Parked rather than ignored: it is a
   * real person and might be forwarding something that matters.
   */
  if ((business.ownDomains ?? []).some((d) => d && sender === d.toLowerCase())) {
    return { what: "park", because: "it came from inside the business" };
  }

  /*
   * Nothing said. A person, but with no question there is nothing to answer
   * and a reply would be a robot asking a stranger what they meant.
   */
  if (!subject && !(email.body ?? "").trim()) {
    return { what: "park", because: "it arrived empty" };
  }

  return { what: "answer", because: "it reads as somebody getting in touch" };
}
