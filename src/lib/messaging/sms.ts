import { createHmac, timingSafeEqual } from "node:crypto";
import type { Delivery } from "./deliver";

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

  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: to, From: sender, Body: body }),
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
