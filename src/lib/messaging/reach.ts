import type { Channel } from "@/lib/types";

/**
 * Whether this customer can be messaged right now, and on what.
 *
 * The honest answer is usually "on one of the three channels they have used,
 * and only if they wrote to you today". Meta's 24-hour rule decides that, not
 * us, and an owner who is about to type a message deserves to know before they
 * type it rather than after they press send.
 *
 * Kept separate from delivery so it can be reasoned about on its own: this
 * decides *whether*, `deliver` does the *how*.
 */

export type Route = {
  channel: Channel;
  /** Whatever that channel addresses — a number, a page-scoped id, a session. */
  to: string;
  /** The thread to continue, or null to start a new one. */
  conversationId: string | null;
  /** A free-form message will be accepted. */
  open: boolean;
  /** Why it will not be, in words the owner can do something about. */
  blocked?: string;
  lastInboundAt: string | null;
};

/**
 * Channels where the business may write first, with no prior message.
 *
 * Text and email, and that is the whole list. Nothing on Meta can start a
 * conversation, which is the single most important thing to know about it.
 */
const CAN_START: Channel[] = ["sms", "email", "web"];

/**
 * Which cold channel to offer first when there is a choice.
 *
 * A text gets read. An email gets read eventually, or not — fine for a receipt,
 * second best for "we have had a cancellation at four".
 */
const COLD_ORDER: Channel[] = ["sms", "email"];

/**
 * Channels Meta holds to a 24-hour reply window.
 *
 * Outside it WhatsApp and Messenger require a template approved in advance,
 * and Instagram allows nothing at all. A platform rule, not ours.
 */
export const WINDOWED: Channel[] = ["whatsapp", "messenger", "instagram"];

const WINDOW_HOURS = 24;

/** Whether the customer has written recently enough to be written back to. */
export function withinWindow(lastInboundAt: string | null | undefined, now = Date.now()): boolean {
  if (!lastInboundAt) return false;
  return now - Date.parse(lastInboundAt) < WINDOW_HOURS * 3600_000;
}

const LABEL: Record<string, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  messenger: "Messenger",
  sms: "Text message",
  web: "The website chat",
  email: "Email",
};

export function channelLabel(channel: Channel): string {
  return LABEL[channel] ?? channel;
}

/** "3 days ago", for explaining a closed window. */
function ago(iso: string, now: number): string {
  const hours = Math.floor((now - Date.parse(iso)) / 3600_000);
  if (hours < 48) return `${hours} hours ago`;
  return `${Math.floor(hours / 24)} days ago`;
}

export function routesFor({
  conversations,
  phone,
  email,
  connected,
  now = Date.now(),
}: {
  conversations: {
    id: string;
    channel: Channel;
    external_ref: string | null;
    last_inbound_at: string | null;
  }[];
  /** The customer's number, if known. The best way to start cold. */
  phone: string | null;
  /** Their email, if known. The other way, and a weaker one. */
  email?: string | null;
  /** Channels this business has actually connected. */
  connected: Channel[];
  now?: number;
}): Route[] {
  const routes: Route[] = [];

  for (const c of conversations) {
    if (!c.external_ref) continue;

    const isConnected = c.channel === "web" || connected.includes(c.channel);
    const windowed = WINDOWED.includes(c.channel);
    const open = withinWindow(c.last_inbound_at, now);

    let blocked: string | undefined;
    if (!isConnected) {
      blocked = `${channelLabel(c.channel)} is not connected to this business.`;
    } else if (windowed && !open) {
      blocked = c.last_inbound_at
        ? `${channelLabel(c.channel)} only allows a message within 24 hours of ` +
          `theirs. They last wrote ${ago(c.last_inbound_at, now)}.`
        : `${channelLabel(c.channel)} only allows a message within 24 hours of theirs.`;
    }

    routes.push({
      channel: c.channel,
      to: c.external_ref,
      conversationId: c.id,
      open: !blocked,
      blocked,
      lastInboundAt: c.last_inbound_at,
    });
  }

  /*
   * Starting cold.
   *
   * Only text messages can do this. There is no way to open a WhatsApp or an
   * Instagram conversation with somebody who has not written first — an owner
   * who expects to is going to be disappointed by the platform, not by us, and
   * saying so here is kinder than letting them find out.
   */
  const cold: { channel: Channel; to: string | null; missing: string }[] = [
    {
      channel: "sms",
      to: phone,
      missing:
        "Text messages are not set up yet. They are the surest way to reach " +
        "somebody who has not written to you first.",
    },
    {
      channel: "email",
      to: email ?? null,
      missing:
        "Email is not set up yet. It is the other way to reach somebody who " +
        "has not written to you first.",
    },
  ];

  for (const { channel, to, missing } of cold) {
    if (!to) continue;
    if (routes.some((r) => r.channel === channel)) continue;

    routes.push({
      channel,
      to,
      conversationId: null,
      open: connected.includes(channel),
      blocked: connected.includes(channel) ? undefined : missing,
      lastInboundAt: null,
    });
  }

  /*
   * What they can actually use, first; then whoever wrote most recently.
   *
   * Cold routes have never been written on, so they fall to the end and are
   * ordered between themselves by which is likelier to be read.
   */
  return routes.sort((a, b) => {
    if (a.open !== b.open) return a.open ? -1 : 1;

    const recency =
      Date.parse(b.lastInboundAt ?? "0") - Date.parse(a.lastInboundAt ?? "0");
    if (recency !== 0) return recency;

    return COLD_ORDER.indexOf(a.channel) - COLD_ORDER.indexOf(b.channel);
  });
}

/** Whether a business can start a conversation on this channel at all. */
export function canStartCold(channel: Channel): boolean {
  return CAN_START.includes(channel);
}
