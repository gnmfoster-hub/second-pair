import type { Delivery } from "./deliver";

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

/** Whether email can be sent at all yet. */
export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
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
  const key = process.env.RESEND_API_KEY;
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
  const sender = fromName ? `${fromName} <${from}>` : from;

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
        ...(replyTo ? { reply_to: replyTo } : {}),
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
};

export async function probeEmail(timeoutMs = 6000): Promise<EmailProbe> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "";
  const senderDomain = from.split("@")[1]?.trim().toLowerCase() || null;

  if (!key || !senderDomain) {
    return {
      keyAccepted: null,
      senderDomain,
      senderVerified: null,
      detail: "Nothing to check: one of the two variables is not set.",
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
    };
  } catch (error) {
    // Resend being unreachable says nothing about the key, so it must not be
    // reported as a failure of it.
    return {
      keyAccepted: null,
      senderDomain,
      senderVerified: null,
      detail: `Could not reach Resend to check: ${(error as Error).message}`,
    };
  }
}
