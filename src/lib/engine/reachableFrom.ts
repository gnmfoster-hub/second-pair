/**
 * What the channel already tells us about how to reach somebody.
 *
 * On email and text the thread key is the address they wrote from — it is
 * literally where the reply is sent — so recording it is free and certain. On
 * the website it is an invented session id, and on Instagram it is a thread
 * handle that reaches nobody outside Instagram, so both stay empty.
 *
 * Pure, and alone in its file, so the one judgement it makes can be tested
 * against the shapes that actually arrive.
 */

export type Reachable = { email?: string; phone?: string };

const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@.]+\.[^\s@]+$/;
// E.164, or the way a UK number is written before anybody tidies it.
const LOOKS_LIKE_PHONE = /^\+?[\d][\d\s().-]{6,20}$/;

export function reachableFrom(channel: string, sessionKey: string): Reachable {
  const key = (sessionKey ?? "").trim();
  if (!key) return {};

  if (channel === "email") {
    return LOOKS_LIKE_EMAIL.test(key) ? { email: key.toLowerCase() } : {};
  }

  if (channel === "sms" || channel === "whatsapp" || channel === "voice") {
    /*
     * Kept exactly as it arrived. It is what a reply is addressed to, and a
     * number tidied on the way in is a number that no longer matches the one
     * the next message comes from.
     */
    return LOOKS_LIKE_PHONE.test(key) ? { phone: key } : {};
  }

  return {};
}
