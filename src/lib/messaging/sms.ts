import { createHmac, timingSafeEqual } from "node:crypto";
import type { Delivery } from "./deliver";
import { forSms } from "./plainText.ts";

/**
 * Text messages, through Twilio.
 *
 * The channel that matters most, because it is the only one that can reach
 * somebody who has not written first. Meta shuts twenty-four hours after the
 * customer's last message; a reminder the evening before an appointment is
 * always outside that. So every reminder, every offer of a cancelled slot, and
 * every message to a new customer is this or it is nothing.
 *
 * One HTTP call rather than their SDK — it is a form post with three fields.
 */

/** Whether text messages can be sent at all yet. */
export function smsConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_FROM_NUMBER,
  );
}

export async function sendSms({
  to,
  body,
  from,
}: {
  to: string;
  body: string;
  /** The business's own number, when it has one. Falls back to ours. */
  from?: string | null;
}): Promise<Delivery> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const sender = from || process.env.TWILIO_FROM_NUMBER;

  if (!sid || !token || !sender) {
    return {
      status: "failed",
      error:
        "Not connected: text messages are not set up yet. Your message is saved " +
        "here but it has not been sent.",
    };
  }

  /*
   * Spelled for the cheap alphabet before it goes.
   *
   * Done here rather than at each caller because every text leaves through
   * this function — the assistant's replies, reminders, and the owner writing
   * from the inbox — and the saving is worth having on all three. What is
   * stored in the conversation keeps its proper typography; only the copy that
   * goes down the wire is changed.
   */
  const text = forSms(body);

  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: to, From: sender, Body: text }),
      },
    );

    const result = (await response.json()) as {
      sid?: string;
      message?: string;
      code?: number;
    };

    if (!response.ok) {
      return { status: "failed", error: readable(result.code, result.message) };
    }

    /*
     * Accepted, not delivered.
     *
     * Twilio takes the message and hands it to a carrier, which may still fail
     * minutes later. Calling this "sent" rather than "delivered" is the honest
     * distinction, and the delivery webhook can promote it afterwards.
     */
    return { status: "sent", externalId: result.sid };
  } catch (error) {
    return {
      status: "failed",
      error: `The message could not be sent: ${(error as Error).message}`,
    };
  }
}

/** Turns Twilio's error codes into something an owner can act on. */
function readable(code: number | undefined, message: string | undefined): string {
  switch (code) {
    case 21211:
      return "That is not a valid mobile number.";
    case 21610:
      return "They have replied STOP, so we are not allowed to text them again.";
    case 21408:
      return "Texting that country is not enabled on the account.";
    case 20003:
      return "Twilio refused the account details. Check the keys.";
    default:
      return message ?? "The message was refused.";
  }
}

/**
 * Proving a webhook really came from Twilio.
 *
 * Without this, the endpoint is a public way to write messages into any
 * business's inbox — invent a From, invent a Body, and the assistant would
 * answer it and could be talked into booking somebody.
 *
 * Twilio signs the full URL followed by every POST field, sorted by name and
 * concatenated as name then value, with the account's auth token as the key.
 */
export function signaturePayload(url: string, params: Record<string, string>): string {
  return Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);
}

export function expectedSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
): string {
  return createHmac("sha1", authToken)
    .update(Buffer.from(signaturePayload(url, params), "utf8"))
    .digest("base64");
}

export function verifySignature({
  authToken,
  url,
  params,
  signature,
}: {
  authToken: string;
  url: string;
  params: Record<string, string>;
  signature: string | null;
}): boolean {
  if (!signature) return false;

  const expected = expectedSignature(authToken, url, params);
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);

  // Same length first: timingSafeEqual throws on a mismatch rather than
  // returning false, and the length itself is not a secret.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Whether texts can actually be sent, rather than whether the keys are typed in.
 *
 * The same lesson as email, learned the expensive way: `smsConfigured` answers
 * a question about environment variables, and a health check that reported
 * that as readiness said yes on the evening every send was failing.
 *
 * Twilio has two ways to be configured and broken that no amount of reading
 * the variables will show:
 *
 *   - The account is still a trial. Trial accounts can only text numbers
 *     somebody has verified by hand, and they prepend a line about being a
 *     trial to every message. Both are fatal here and neither is an error —
 *     Twilio accepts the send and does something useless with it.
 *
 *   - The from-number does only half the job. A number that cannot receive
 *     texts, or cannot take calls, gives exactly half a product: texts arrive
 *     and calls vanish, or the reverse, with nothing anywhere saying so.
 *
 * Never throws and never hangs: this sits behind a check somebody reaches for
 * when they already suspect something is wrong.
 */
export type SmsProbe = {
  credentialsAccepted: boolean | null;
  /** "trial" is the one that matters. Live accounts read "active". */
  accountStatus: string | null;
  /** Numbers on the account, and what each can actually do. */
  numbers: { number: string; sms: boolean; voice: boolean }[];
  /** Whether EMAIL_FROM's opposite number — TWILIO_FROM_NUMBER — is one of them. */
  fromNumberOwned: boolean | null;
  detail: string | null;
};

export async function probeSms(timeoutMs = 6000): Promise<SmsProbe> {
  const sid = (process.env.TWILIO_ACCOUNT_SID ?? "").trim();
  const token = (process.env.TWILIO_AUTH_TOKEN ?? "").trim();
  const from = (process.env.TWILIO_FROM_NUMBER ?? "").trim();

  const empty: SmsProbe = {
    credentialsAccepted: null,
    accountStatus: null,
    numbers: [],
    fromNumberOwned: null,
    detail: null,
  };

  if (!sid || !token) {
    return { ...empty, detail: "Nothing to check: the account keys are not set." };
  }

  const auth = "Basic " + Buffer.from(`${sid}:${token}`).toString("base64");
  const stop = AbortSignal.timeout(timeoutMs);

  try {
    const account = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}.json`, {
      headers: { Authorization: auth },
      signal: stop,
    });

    if (!account.ok) {
      const detail = await account
        .json()
        .then((body: { message?: string }) => body?.message)
        .catch(() => null);
      return {
        ...empty,
        credentialsAccepted: false,
        detail: detail ?? `Twilio refused the keys (${account.status}).`,
      };
    }

    const { status } = (await account.json()) as { status?: string };

    const listed = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/IncomingPhoneNumbers.json?PageSize=50`,
      { headers: { Authorization: auth }, signal: stop },
    );

    const numbers = listed.ok
      ? (
          ((await listed.json()) as {
            incoming_phone_numbers?: {
              phone_number?: string;
              capabilities?: { sms?: boolean; voice?: boolean };
            }[];
          }).incoming_phone_numbers ?? []
        ).map((n) => ({
          number: n.phone_number ?? "",
          sms: Boolean(n.capabilities?.sms),
          voice: Boolean(n.capabilities?.voice),
        }))
      : [];

    const owned = from ? numbers.some((n) => n.number === from) : null;

    return {
      credentialsAccepted: true,
      accountStatus: status ?? null,
      numbers,
      fromNumberOwned: owned,
      detail: describe(status, from, numbers, owned),
    };
  } catch (error) {
    // Twilio being unreachable says nothing about the keys.
    return { ...empty, detail: `Could not reach Twilio to check: ${(error as Error).message}` };
  }
}

/** The one sentence somebody actually needs, or nothing when all is well. */
function describe(
  status: string | undefined,
  from: string,
  numbers: { number: string; sms: boolean; voice: boolean }[],
  owned: boolean | null,
): string | null {
  if (status === "trial") {
    return (
      "This account is still a trial. Trial accounts only text numbers verified by " +
      "hand and add a line about being a trial to every message. Add a payment " +
      "method to upgrade it."
    );
  }
  if (!numbers.length) return "The keys work, and the account has no phone numbers on it yet.";
  if (!from) return "TWILIO_FROM_NUMBER is not set, so there is no fallback sender.";
  if (owned === false) {
    return `TWILIO_FROM_NUMBER (${from}) is not one of the numbers on this account.`;
  }

  const mine = numbers.find((n) => n.number === from);
  if (mine && !(mine.sms && mine.voice)) {
    return (
      `${from} can ${mine.sms ? "text but not take calls" : "take calls but not text"}. ` +
      "Missed-call-to-text needs both on the same number."
    );
  }
  return null;
}
