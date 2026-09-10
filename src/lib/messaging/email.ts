import type { Delivery } from "./deliver";
import { domainOf, senderLine, usableAddress } from "./address.ts";

/**
 * Sending email.
 *
 * One HTTP call to Resend, rather than their SDK. It is a single endpoint with
 * four fields, and a dependency that has to be kept up to date earns its place
 * by doing more than that.
 *
 * Nothing here throws. A send that fails comes back as a `failed` delivery with
 * a reason, because the caller has already written the message down and needs
 * to record whether it left — an exception thrown up the stack would lose that.
 */

const ENDPOINT = "https://api.resend.com/emails";

/**
 * The key, without whatever came along with it.
 *
 * A key is copied out of one dashboard and pasted into another, and neither a
 * trailing newline nor a pair of quotes is visible in either. Resend answers
 * "API key is invalid" to all of them, which sends somebody hunting for a bad
 * key rather than for a bad paste.
 *
 * Quotes get there honestly: every example of an environment variable ever
 * written shows KEY="value", so typing the quotes into a box that wants only
 * the value is the obvious mistake, not a careless one.
 *
 * A real key is a bare token with no space and no quotes around it, so none of
 * this can break a working one. The health check says when it had to do any of
 * it, because a paste that needs cleaning up will need cleaning up again.
 */
export function tidyKey(raw: string): string {
  let key = raw.trim();
  // One layer, matched: "re_x" and 're_x' are pastes; re_"x" is not, and
  // stripping from that would make a broken key look plausible.
  if (key.length > 1 && (key.at(0) === '"' || key.at(0) === "'") && key.at(-1) === key.at(0)) {
    key = key.slice(1, -1).trim();
  }
  return key;
}

function apiKey(): string {
  return tidyKey(process.env.RESEND_API_KEY ?? "");
}

/** Whether email can be sent at all yet. */
export function emailConfigured(): boolean {
  return Boolean(apiKey() && process.env.EMAIL_FROM);
}

export type Attachment = {
  filename: string;
  /** Base64. Calendar files and PDFs, not photographs. */
  content: string;
  contentType?: string;
};

export async function sendEmail({
  to,
  subject,
  text,
  html,
  replyTo,
  fromName,
  attachments,
}: {
  to: string;
  subject: string;
  /** Always provide this. Some people read mail as plain text, and so do spam filters. */
  text: string;
  html?: string;
  /** Where a reply should go — usually the business, not us. */
  replyTo?: string;
  /** The business's name in the From line, so it does not look like it came from us. */
  fromName?: string;
  attachments?: Attachment[];
}): Promise<Delivery> {
  const key = apiKey();
  const from = process.env.EMAIL_FROM;

  if (!key || !from) {
    return {
      status: "failed",
      error:
        "Not connected: email is not set up yet. Your message is saved here but " +
        "it has not been sent.",
    };
  }

  /*
   * The business's name over our address.
   *
   * The domain has to be one Resend has verified, so it cannot be the salon's
   * own. Their name in the display line is the next best thing, and the
   * reply-to means an answer still reaches them rather than us.
   */
  const sender = senderLine(from, fromName);

  /*
   * A reply-to nobody can use is dropped, not sent.
   *
   * It is the business's own address out of a settings box, and a typo in it
   * used to take the entire message down with it: Resend refuses the send, the
   * customer gets nothing, and the fault is a comma somebody cannot see. The
   * answer matters more than the convenience of replying straight to the
   * business, so a bad one is left off and the message goes.
   *
   * The recipient is different and is left to fail: there is no message
   * without somebody to send it to, and pretending otherwise would report a
   * delivery that never happened.
   */
  const replyAddress = usableAddress(replyTo);
  if (replyTo && !replyAddress) {
    console.error("[email] unusable reply-to, sending without it:", replyTo);
  }

  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: sender,
        to: [to],
        subject,
        text,
        ...(html ? { html } : {}),
        ...(replyAddress ? { reply_to: replyAddress } : {}),
        ...(attachments?.length ? { attachments } : {}),
      }),
    });

    if (!response.ok) {
      // Resend puts something readable in `message`; fall back to the status.
      const detail = await response
        .json()
        .then((body: { message?: string }) => body?.message)
        .catch(() => null);

      return {
        status: "failed",
        error: detail ?? `Email was refused (${response.status}).`,
      };
    }

    const { id } = (await response.json()) as { id?: string };
    return { status: "sent", externalId: id };
  } catch (error) {
    // Network trouble, not a refusal. Same outcome for the customer.
    return { status: "failed", error: `Email could not be sent: ${(error as Error).message}` };
  }
}

/**
 * Whether mail can actually leave, rather than whether the keys are typed in.
 *
 * `emailConfigured` answers a question about environment variables, and the
 * health check reported that answer as though it meant working. It did not: on
 * the evening the keys first went onto Production the health check said email
 * was ready, and every send was coming back "API key is invalid". A green light
 * that can be wrong about the one thing it is for is worse than no light.
 *
 * So this asks Resend. Listing domains is the cheapest authenticated call they
 * have, it sends nothing to anybody, and the answer settles both halves at once
 * — whether the key is accepted, and whether the address in EMAIL_FROM is on a
 * domain that has actually been verified. A key can be perfectly valid and mail
 * still be refused because the sending domain never finished its DNS.
 *
 * Never throws, and never hangs: this sits behind a health check somebody
 * reaches for when they already suspect something is wrong.
 */
export type EmailProbe = {
  keyAccepted: boolean | null;
  senderDomain: string | null;
  senderVerified: boolean | null;
  detail: string | null;
  /**
   * What the key looks like, without being it.
   *
   * Its prefix and its length, which is enough to tell a Resend key from a
   * Stripe one pasted into the wrong box, or a truncated copy from a whole
   * one — and is not the key. Says so when there was space around it, since
   * that is invisible in every dashboard it passes through.
   */
  keyShape: string | null;
};

export async function probeEmail(timeoutMs = 6000): Promise<EmailProbe> {
  const raw = process.env.RESEND_API_KEY ?? "";
  const key = tidyKey(raw);
  const from = process.env.EMAIL_FROM ?? "";
  const senderDomain = domainOf(from) || null;
  const keyShape = key
    // Plain ASCII: this is read out of a JSON response in a terminal, and a
    // pretty ellipsis arrives there as mojibake.
    ? `starts "${key.slice(0, 3)}", ${key.length} characters` +
      (raw === key ? "" : ", after taking off the quotes or space it was pasted with")
    : null;

  if (!key || !senderDomain) {
    return {
      keyAccepted: null,
      senderDomain,
      senderVerified: null,
      detail: "Nothing to check: one of the two variables is not set.",
      keyShape,
    };
  }

  const stop = AbortSignal.timeout(timeoutMs);

  try {
    const response = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${key}` },
      signal: stop,
    });

    if (!response.ok) {
      const detail = await response
        .json()
        .then((body: { message?: string }) => body?.message)
        .catch(() => null);
      return {
        keyAccepted: false,
        senderDomain,
        senderVerified: null,
        detail: detail ?? `Resend refused the key (${response.status}).`,
        keyShape,
      };
    }

    const body = (await response.json()) as {
      data?: { name?: string; status?: string }[];
    };
    const domains = body.data ?? [];
    const mine = domains.find((d) => d.name?.trim().toLowerCase() === senderDomain);

    return {
      keyAccepted: true,
      senderDomain,
      senderVerified: mine ? mine.status === "verified" : false,
      detail: mine
        ? mine.status === "verified"
          ? null
          : `${senderDomain} is on the account but its status is "${mine.status}".`
        : `${senderDomain} is not one of the domains on this Resend account` +
          (domains.length
            ? ` (it has ${domains.map((d) => d.name).filter(Boolean).join(", ")}).`
            : " — the account has no domains at all."),
      keyShape,
    };
  } catch (error) {
    // Resend being unreachable says nothing about the key, so it must not be
    // reported as a failure of it.
    return {
      keyAccepted: null,
      senderDomain,
      senderVerified: null,
      detail: `Could not reach Resend to check: ${(error as Error).message}`,
      keyShape,
    };
  }
}

/**
 * Fetching the words, because the webhook does not carry them.
 *
 * Resend's inbound webhook is an envelope: who it was from, who it was for, a
 * subject, an id. Not a syllable of the message. Their own blog says
 * otherwise, and the first live email settled it — the subject line arrived
 * and nothing else, and the assistant correctly refused to answer on that
 * alone.
 *
 * So the id is redeemed here for the actual email. Never throws: a customer
 * whose message we could not fetch is parked in the inbox for a person to read,
 * which is a slower answer and never a wrong one.
 */
export async function fetchReceivedEmail(
  id: string,
  timeoutMs = 8000,
): Promise<{ text: string | null; html: string | null; headers: Record<string, string> } | null> {
  const key = apiKey();
  if (!key || !id) return null;

  const stop = AbortSignal.timeout(timeoutMs);

  try {
    const response = await fetch(
      `https://api.resend.com/emails/receiving/${encodeURIComponent(id)}`,
      { headers: { Authorization: `Bearer ${key}` }, signal: stop },
    );

    if (!response.ok) {
      console.error("[inbound] could not fetch", id, response.status);
      return null;
    }

    const body = (await response.json()) as {
      text?: string | null;
      html?: string | null;
      headers?: Record<string, unknown> | { name?: string; value?: string }[] | null;
    };

    /*
     * The headers come back too, and they matter more than they look.
     *
     * Whether a message is answered at all is decided by them — List-Unsubscribe,
     * Auto-Submitted, Precedence. The webhook carries none, so without this
     * every newsletter forwarded to a business's enquiry address would read as
     * a person getting in touch and be answered like one.
     */
    const headers: Record<string, string> = {};
    if (Array.isArray(body.headers)) {
      for (const h of body.headers as { name?: string; value?: string }[]) {
        if (h?.name) headers[h.name.toLowerCase()] = String(h.value ?? "");
      }
    } else if (body.headers && typeof body.headers === "object") {
      for (const [k, v] of Object.entries(body.headers)) {
        headers[k.toLowerCase()] = String(v ?? "");
      }
    }

    return { text: body.text ?? null, html: body.html ?? null, headers };
  } catch (error) {
    console.error("[inbound] could not fetch", id, (error as Error).message);
    return null;
  }
}
