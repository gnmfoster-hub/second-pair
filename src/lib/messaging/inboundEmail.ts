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
  /**
   * The business's own addresses it was sent to, before it reached us.
   *
   * Kept apart from `to`, which is every address it arrived by including ours.
   * This is the only thing that can tell the accountant's email from the
   * customer's once a whole mailbox is being forwarded: both land at the same
   * address of ours, and only the original recipient says which of the
   * business's addresses somebody actually wrote to.
   */
  sentTo?: string[];
};

export type Verdict = {
  what: "answer" | "park" | "ignore";
  /** Said in the owner's terms, for the note in the inbox. */
  because: string;
  /**
   * Whether this is us setting the address up rather than somebody writing in.
   *
   * A verification code from a mail provider is the one piece of inbound mail
   * that is our business as well as theirs — it exists because we asked them
   * to point a mailbox at us, and somebody on this side needs to know it
   * arrived. Everything else that comes through here is a customer writing to
   * a business, and none of that is ours to keep a record of.
   *
   * So it is marked rather than inferred from the wording, because what gets
   * written down on our side hangs off it.
   */
  setup?: true;
};

/**
 * How much of a business's email the assistant may answer by itself.
 *
 * Written for the business with one address for everything. Forwarding a whole
 * mailbox to an assistant that answers anything a person wrote means it
 * replies to their accountant, their supplier and their sister, in the
 * business's name, about cleaning — which costs almost nothing and is
 * mortifying, and is the sort of thing that ends a customer relationship.
 *
 *  all    — anything that reads like somebody getting in touch. Right when a
 *           dedicated enquiry address is being forwarded, and the default,
 *           because it is what every business set up so far is doing.
 *  listed — only mail written to the addresses they have named as public.
 *           Everything else is filed for them to read. This is the one for a
 *           forwarded mailbox.
 *  none   — nothing is answered automatically. Everything is filed, tidied and
 *           waiting, and a person writes every reply.
 */
export type InboundMode = "all" | "listed" | "none";

export const INBOUND_MODES: InboundMode[] = ["all", "listed", "none"];

export function readInboundMode(raw: unknown): InboundMode {
  return INBOUND_MODES.includes(raw as InboundMode) ? (raw as InboundMode) : "all";
}

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

/**
 * An unsubscribe link, which is the thing only a bulk sender carries.
 *
 * Both orders, because the markup and the plain text put them the opposite way
 * round: a flattened anchor gives "https://…/u/123 Unsubscribe" and a text
 * part gives "Unsubscribe: https://…". Fifty characters between them is enough
 * for "click here to unsubscribe from these emails" and short enough that the
 * word in one paragraph and an unrelated link in the next do not pair up.
 */
const UNSUBSCRIBE_LINK =
  /(unsubscribe|opt[-\s]?out)[^\n]{0,50}https?:\/\/|https?:\/\/[^\s]{0,200}(unsubscribe|opt[-_]?out)/i;

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
import { coldPitch } from "./coldPitch.ts";
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
  business: {
    ownDomains?: string[];
    ourDomain?: string;
    /** How much it may answer by itself. See InboundMode. */
    mode?: InboundMode;
    /** Their public addresses, when the mode is "listed". */
    answerTo?: string[];
    /** The business's name, which a scraper squashes into one word. */
    name?: string;
  } = {},
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
      setup: true,
    };
  }

  /*
   * Mail the business's own provider has already called spam.
   *
   * Neat & Tidy's forward arrives with "***SPAM***" stamped on the subject by
   * the mailbox it came through, and the assistant answered two of them — a
   * judgement somebody else had already made, and made correctly. Their
   * filter sees the sender's reputation and the message's authentication,
   * which a forwarded copy no longer carries, so its word is taken.
   */
  const flagged =
    (headers["x-spam-flag"] ?? "").trim().toLowerCase() === "yes" ||
    /^\s*yes\b/i.test(headers["x-spam-status"] ?? "") ||
    /^\s*(?:\*{2,}\s*spam\s*\*{2,}|\[spam\]|spam:)/i.test(email.subject ?? "");
  if (flagged) {
    return { what: "ignore", because: "the mailbox it came through had already marked it as spam" };
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
   * The word every bulk sender has to include and no customer ever writes.
   *
   * List-Unsubscribe above catches the ones that set the header. Plenty do not
   * — a classified-ads company's advert statistics reached Neat & Tidy with no
   * machine headers at all, and was answered in the business's own name.
   *
   * Parked rather than ignored, because a person can mention unsubscribing: "I
   * keep getting your newsletter, can you take me off it" is a real thing to
   * say to a business, and it deserves a human rather than silence.
   */
  const body = email.body ?? "";

  /*
   * A link to unsubscribe, which only a bulk sender has.
   *
   * The note above is sound and the result was wrong. Parking puts a thing in
   * the inbox flagged as needing a person — so a cleaning directory's listing
   * notice sat at the top of a real business's inbox marked urgent, and was
   * reported as an irrelevant email the assistant already knew was a waste of
   * time.
   *
   * The two are easy to separate once you look for the right thing: a mailing
   * carries an unsubscribe *link*, a person types the word. So a link is a
   * mailing and is ignored outright — no conversation, nothing in the inbox —
   * and the bare word still parks, which keeps the case the note protects.
   */
  if (UNSUBSCRIBE_LINK.test(body)) {
    return { what: "ignore", because: "it is a mailing with an unsubscribe link in it" };
  }

  if (/unsubscribe/i.test(body)) {
    return { what: "park", because: "it mentions unsubscribing, so a person should read it" };
  }

  /*
   * Nothing said, and a subject line is not a message.
   *
   * This used to require both to be empty, so "testing mailbox" with an empty
   * body was answered — and that is the commonest shape of email a business's
   * address receives that is not a customer: a test, a forward with the note
   * stripped, a "FYI" with the attachment as the whole point.
   *
   * Somebody does occasionally put a real enquiry in a subject line and send
   * it from a phone. Parking loses nothing there — it lands in the inbox, a
   * person reads it and replies — where answering everything means writing
   * back to every test anybody ever sends.
   *
   * Park rather than ignore, because a person sent it and a person should see
   * it. Ignoring is for machines.
   */
  if (!(email.body ?? "").trim()) {
    return {
      what: "park",
      because: subject
        ? "there is a subject and nothing else, which is rarely a customer"
        : "it arrived empty",
    };
  }

  /*
   * Somebody selling to the business, not a customer.
   *
   * After everything that parks mail for a person — a verification code, the
   * business itself, somebody asking to unsubscribe — and before anything is
   * answered. Ignored rather than parked: every business on here receives
   * these by the dozen, and a pitch in the inbox flagged as needing a person
   * is the noise the inbox exists to keep out. Nothing is lost by it; the
   * email is still in the business's own mailbox, which only ever forwarded
   * a copy. See coldPitch for how it is told apart from a customer.
   */
  const pitch = coldPitch(email, { name: business.name });
  if (pitch.pitch) {
    return { what: "ignore", because: `it reads as a sales pitch (${pitch.signs.join("; ")})` };
  }

  /*
   * Last, and deliberately last.
   *
   * Everything above decides whether this is worth a human's attention at all.
   * This decides only whether the assistant may answer it without being asked,
   * so it must not be able to promote a newsletter into the inbox — it can
   * only ever hold something back.
   */
  const mode = business.mode ?? "all";

  if (mode === "none") {
    return { what: "park", because: "this business answers its own email" };
  }

  if (mode === "listed") {
    const public_ = (business.answerTo ?? []).map((a) => addressOf(a)).filter(Boolean);

    // Nothing named means nothing is public, which would silently park every
    // enquiry a business ever received. Treated as not yet set up.
    if (!public_.length) {
      return {
        what: "park",
        because: "no public address has been set, so nothing is answered automatically",
      };
    }

    const wroteTo = (email.sentTo ?? []).map((a) => addressOf(a)).filter(Boolean);
    if (!wroteTo.some((one) => public_.includes(one))) {
      return {
        what: "park",
        because: "it was not sent to a public address, so it is probably not a customer",
      };
    }
  }

  return { what: "answer", because: "it reads as somebody getting in touch" };
}

/**
 * The provider's shape, read defensively.
 *
 * Written against Resend's inbound webhook, which nests the message under
 * `data`. Every field is read from more than one place because this is the one
 * piece of the system whose format belongs to somebody else — a rename at
 * their end should come out as "we could not read it" rather than as a
 * customer being quietly dropped.
 */
export function readEmail(payload: Record<string, unknown>): InboundEmail | null {
  const data = ((payload.data as Record<string, unknown>) ?? payload) || {};

  const pick = (...keys: string[]): string | null => {
    for (const k of keys) {
      const v = data[k] ?? payload[k];
      if (typeof v === "string" && v.trim()) return v;
      if (Array.isArray(v) && typeof v[0] === "string") return v[0];
    }
    return null;
  };

  const rawHeaders = (data.headers ?? payload.headers) as unknown;
  const headers: Record<string, string> = {};

  if (Array.isArray(rawHeaders)) {
    for (const h of rawHeaders as { name?: string; value?: string }[]) {
      if (h?.name) headers[h.name.toLowerCase()] = String(h.value ?? "");
    }
  } else if (rawHeaders && typeof rawHeaders === "object") {
    for (const [k, v] of Object.entries(rawHeaders as Record<string, unknown>)) {
      headers[k.toLowerCase()] = String(v ?? "");
    }
  }

  const from = pick("from", "sender", "From");
  if (!from) return null;

  /*
   * Every address it reached us by, not just the To line.
   *
   * A business forwards its own enquiry address to <slug>@in.second-pair.com,
   * which means the To header still says hello@theirfirm.co.uk — their
   * address, not ours. Providers put the address actually delivered to in a
   * separate field: Resend calls it received_for. Reading only To would take
   * "hello" for the slug, find no such business, and drop the enquiry without
   * a word.
   *
   * All of them are handed over comma-separated, and ourRecipient picks the
   * one on our own domain, which is what it was written to do.
   */
  const everyone = ["received_for", "recipient", "to", "To", "cc", "Cc"]
    .flatMap((key) => {
      const v = data[key] ?? payload[key];
      if (typeof v === "string") return [v];
      if (Array.isArray(v)) return v.filter((one) => typeof one === "string") as string[];
      return [];
    })
    .filter((one) => one.includes("@"));

  /*
   * Who they actually wrote to, as opposed to how it reached us.
   *
   * received_for is the address at our end that the forwarding delivered to,
   * so it is deliberately not in here — it is the same for every email a
   * business forwards and says nothing about who the message was for.
   */
  const wroteTo = ["to", "To", "cc", "Cc"]
    .flatMap((key) => {
      const v = data[key] ?? payload[key];
      if (typeof v === "string") return v.split(",");
      if (Array.isArray(v)) return v.filter((one) => typeof one === "string") as string[];
      return [];
    })
    .map((one) => addressOf(one))
    .filter((one) => one.includes("@"));

  return {
    from,
    sentTo: wroteTo,
    to: everyone.length ? everyone.join(", ") : pick("to", "recipient", "To"),
    subject: pick("subject", "Subject"),
    /*
     * The words, whatever part they arrived in.
     *
     * A great deal of mail carries no plain-text part at all, and handing the
     * markup straight to the assistant means it reads a wall of tags and may
     * quote them back at a customer.
     */
    body: flatten(pick("text", "body", "plain")) ?? flatten(pick("html")),
    headers,
  };
}

/**
 * Markup down to words, or null if there was none.
 *
 * Applied to the plain-text part as well, which sounds redundant and is not:
 * the field is picked by name, and a provider that puts markup under "body"
 * sails straight past the check for "html". That is not hypothetical — a
 * classified-ads company's statistics email reached the assistant as a
 * DOCTYPE, a stylesheet and a comment about old Outlook, and it was asked to
 * decide whether that was a customer.
 *
 * Text with no tags in it comes back unchanged, so the only cost is being sure.
 */
function flatten(html: string | null): string | null {
  if (!html) return null;
  if (!/<[a-z!/][^>]*>/i.test(html)) return html.trim() || null;
  const text = plainTextFrom(html);
  return text || null;
}
