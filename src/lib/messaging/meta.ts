import { createHmac, timingSafeEqual } from "node:crypto";
import type { Channel } from "@/lib/types";

/**
 * Reading what Meta sends, for all three of their channels.
 *
 * One webhook carries WhatsApp, Messenger and Instagram, and they do not agree
 * on a shape. WhatsApp nests messages under `changes[].value`; the other two
 * put them under `messaging[]`. Both bundle several unrelated things into one
 * delivery, most of which must be ignored rather than answered.
 *
 * That last part is the whole reason this is a module of its own with tests
 * around it. Meta re-sends a page's own outgoing messages back to it as
 * "echoes", and sends read receipts and delivery receipts down the same pipe.
 * Answering any of them means the assistant talking to itself, on somebody's
 * customer's phone, in a loop that bills per message.
 */

export type MetaEvent = {
  channel: Channel;
  /** The account the message arrived at: a phone number id, or a page id. */
  accountId: string;
  /** The person who sent it, as Meta identifies them. Stable per account. */
  personId: string;
  text: string;
  /** Attachment ids or urls, depending on the channel. */
  media: string[];
  /** Meta's own id, so the same delivery twice is not answered twice. */
  messageId: string | null;
};

type Bag = Record<string, unknown>;

const obj = (v: unknown): Bag => (v && typeof v === "object" ? (v as Bag) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === "string" ? v : "");

/**
 * Every message worth answering in one delivery, and nothing else.
 *
 * Deliberately forgiving about shape and unforgiving about intent: an entry it
 * does not recognise is skipped rather than guessed at, because the cost of
 * guessing wrong is a reply going to a stranger.
 */
export function readMetaEvents(payload: unknown): MetaEvent[] {
  const body = obj(payload);
  const object = str(body.object);
  const out: MetaEvent[] = [];

  for (const rawEntry of arr(body.entry)) {
    const entry = obj(rawEntry);

    // ---------------------------------------------------------- WhatsApp
    for (const rawChange of arr(entry.changes)) {
      const value = obj(obj(rawChange).value);

      /*
       * Delivery and read receipts come down the same pipe as messages.
       * There is nothing to answer and answering would be a loop.
       */
      if (arr(value.statuses).length && !arr(value.messages).length) continue;

      const accountId = str(obj(value.metadata).phone_number_id);
      if (!accountId) continue;

      for (const rawMessage of arr(value.messages)) {
        const message = obj(rawMessage);
        const from = str(message.from);
        if (!from) continue;

        const text = str(obj(message.text).body) || str(obj(message.button).text);
        const media = [
          str(obj(message.image).id),
          str(obj(message.video).id),
          str(obj(message.document).id),
        ].filter(Boolean);

        // A sticker or a location with no words is not an enquiry.
        if (!text && !media.length) continue;

        out.push({
          channel: "whatsapp",
          accountId,
          personId: from,
          text,
          media,
          messageId: str(message.id) || null,
        });
      }
    }

    // ------------------------------------------- Messenger and Instagram
    for (const rawItem of arr(entry.messaging)) {
      const item = obj(rawItem);
      const message = obj(item.message);

      /*
       * The page's own outgoing messages, sent back to it.
       *
       * Answering an echo means answering ourselves, forever, on somebody's
       * customer's phone. It is the single most important line here.
       */
      if (message.is_echo === true) continue;

      // Read receipts, delivery receipts, postbacks from buttons we do not use.
      if (!message.mid && !message.text && !arr(message.attachments).length) continue;

      const accountId = str(obj(item.recipient).id) || str(entry.id);
      const personId = str(obj(item.sender).id);
      if (!accountId || !personId) continue;

      // Somebody's page messaging itself, which happens in testing.
      if (accountId === personId) continue;

      const media = arr(message.attachments)
        .map((a) => str(obj(obj(a).payload).url))
        .filter(Boolean);

      const text = str(message.text);
      if (!text && !media.length) continue;

      out.push({
        channel: object === "instagram" ? "instagram" : "messenger",
        accountId,
        personId,
        text,
        media,
        messageId: str(message.mid) || null,
      });
    }
  }

  return out;
}

/**
 * Proof the delivery came from Meta.
 *
 * Without it this endpoint is a way for anybody to put words in a customer's
 * mouth and make the assistant answer them. Meta signs the raw body with the
 * app secret, so it has to be checked against the bytes as they arrived —
 * parsing and re-serialising changes them and the signature will not match.
 */
export function verifyMetaSignature({
  appSecret,
  rawBody,
  header,
}: {
  appSecret: string;
  rawBody: string;
  header: string | null;
}): boolean {
  if (!appSecret || !header) return false;

  const [algorithm, sent] = header.split("=");
  if (algorithm !== "sha256" || !sent) return false;

  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");

  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(sent, "hex");
  // Lengths differ on a malformed header, and timingSafeEqual throws on that.
  if (a.length !== b.length || a.length === 0) return false;

  return timingSafeEqual(a, b);
}

/**
 * The handshake Meta does once, when the webhook address is first saved.
 *
 * It sends a token we chose and a challenge; we return the challenge only if
 * the token matches. Getting this wrong is the reason a webhook will not save.
 */
export function verificationReply(
  params: URLSearchParams,
  expectedToken: string,
): string | null {
  if (!expectedToken) return null;
  if (params.get("hub.mode") !== "subscribe") return null;
  if (params.get("hub.verify_token") !== expectedToken) return null;
  return params.get("hub.challenge");
}
