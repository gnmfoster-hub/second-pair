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

/**
 * Mail the owner is waiting for, from a machine.
 *
 * Setting up forwarding means proving you control the address it forwards to,
 * and every mail provider does that by sending a code to it. That code arrives
 * here, from a no-reply sender, marked automatic — which is precisely the
 * shape of everything this file exists to throw away. So the one message an
 * owner is sitting there waiting for is the one most certain to be binned.
 *
 * It is checked before the machine rules rather than after, because it is a
 * machine and would never survive them.
 */
const VERIFYING = [
  // "Gmail Forwarding Confirmation", "Confirm forwarding to ..."
  /forwarding[^.]{0,40}(confirmation|confirm|request)/i,
  /(confirm|verify)[^.]{0,20}forwarding/i,
  // "Your verification code is 123456", "confirmation code"
  /(verification|confirmation|security)[ -]?code/i,
  // "Verify your email address", "Please verify this address"
  /verify (your|this|the) (email|address|e-mail)/i,
];

/** Addresses that exist to send and never to receive. */
const NEVER_REPLY = /^(no[-_.]?reply|do[-_.]?not[-_.]?reply|bounce|mailer-daemon|postmaster|abuse|notifications?|alerts?|billing|invoices?)@/i;

/** Subjects a mail system writes, not a person. */
const MACHINE_SUBJECT =
  /^(undeliverable|delivery status notification|mail delivery|returned mail|automatic reply|out of office|auto(matic)?[- ]?reply|read receipt)/i;

/*
 * Reading an address, wherever it is read.
 *
 * "Jo Marsh <jo@gmail.com>" and "jo@gmail.com" are the same person, and which
 * one arrives depends entirely on the mail client at the other end. Kept in one
 * place now that the sending side needs the same answer, and re-exported here
 * because this is where a reader of the inbound rules expects to find it.
 */
import { addressOf, domainOf } from "./address.ts";
export { addressOf, domainOf };

/**
 * Which of the addresses it was sent to is ours.
 *
 * A To line is not one address. It is a display name wrapped round one, or
 * several separated by commas because somebody copied in their partner, and
 * the business's own address might be any of them. Taking the first and
 * splitting on "@" gave "the fold hair <demo-fold" the moment a provider
 * included a display name, and the enquiry was dropped as belonging to no
 * business at all — silently, since a dropped email leaves nothing behind.
 */
export function ourRecipient(to: string, ourDomain: string): string | null {
  const all = to
    .split(",")
    .map((one) => addressOf(one))
    .filter((one) => one.includes("@"));

  const domain = ourDomain.trim().toLowerCase();
  const mine = all.find((one) => one.endsWith(`@${domain}`));

  // Falling back to the first: better to try a business name we may not find
  // than to drop the message because the domain was configured differently
  // from what we expected.
  return mine ?? all[0] ?? null;
}

/**
 * Words out of an HTML-only email.
 *
 * Plenty of mail carries no plain-text part at all. Handed the markup, the
 * assistant reads a wall of tags and may quote them back — so scripts and
 * styles go entirely, tags become spaces, and the entities anybody actually
 * types are turned back into characters.
 */
export function plainTextFrom(html: string): string {
  const BREAK = "\n";

  return html
    .replace(/<(script|style)[\s\S]*?<\/(?:script|style)>/gi, " ")
    .replace(/<br\s*\/?>/gi, BREAK)
    .replace(/<\/(?:p|div|tr|li|h[1-6])>/gi, BREAK)
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    /*
     * Ampersand last, so a literal "&amp;lt;" in the original comes out as
     * "&lt;" rather than as a "<" that was never written.
     */
    .replace(/&amp;/gi, "&")
    .replace(/[^\S\n]+/g, " ")
    // A closing tag became a break and the next opening tag became a space,
    // so every line would otherwise start with one.
    .replace(/[^\S\n]*\n[^\S\n]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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

  /*
   * Before anything else, because it is the mail somebody is waiting for.
   *
   * Parked rather than answered: nobody should write back to a verification
   * robot. But it has to reach the owner, and everything below this line would
   * have thrown it away.
   */
  const opening = `${email.subject ?? ""} ${(email.body ?? "").slice(0, 400)}`;
  if (VERIFYING.some((pattern) => pattern.test(opening))) {
    return {
      what: "park",
      because: "it looks like a code for setting this address up — read it and carry on",
    };
  }

  const machine = fromAMachine(headers);
  if (machine) return { what: "ignore", because: machine };

  const from = addressOf(email.from ?? "");
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
