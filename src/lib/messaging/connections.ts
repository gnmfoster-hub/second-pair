import type { SupabaseClient } from "@supabase/supabase-js";
import type { Channel } from "@/lib/types";
// With extensions, so node can load this file directly and a check script can
// ask the real rule rather than writing its own copy of it. The type import
// above is erased, so the @/ alias in it costs nothing.
import { emailConfigured } from "./email.ts";
import { smsConfigured } from "./sms.ts";

/**
 * Which ways of reaching people this business has actually plugged in.
 *
 * The widget is always there — it is served from this application and needs
 * nothing connecting. Everything else has to have been set up, and a channel
 * that has not been is the difference between a message going and a message
 * looking like it went.
 */
export async function connectedChannels(
  supabase: SupabaseClient,
  studioId: string,
): Promise<Channel[]> {
  const { data, error } = await supabase
    .from("channel_connections")
    .select("channel")
    .eq("studio_id", studioId)
    .eq("active", true);

  /*
   * "Could not read" is not "nothing connected".
   *
   * The error was discarded, so an unreadable table said this business has no
   * channels — and everything downstream treats that as a business that is
   * not set up rather than as a failure. Reminders fall to "waiting", which
   * the nightly job deliberately does not count as going wrong, and the whole
   * run reports a healthy evening while a fully configured business's
   * reminders stop dead.
   */
  if (error) throw new Error(`could not read the channels: ${error.message}`);

  const found = new Set<Channel>((data ?? []).map((r) => r.channel as Channel));

  // The widget is served from here and needs nothing connecting.
  found.add("web");

  /*
   * Email is not connected per business — it is one account of ours, and every
   * business sends through it under its own name. So it is on for everybody or
   * nobody, decided by whether the key is in the environment.
   */
  if (emailConfigured()) found.add("email");

  /*
   * Text messages need both halves: a number registered to this business, so a
   * reply knows where to come back to, and the keys to send with. A number
   * with no keys sends nothing; keys with no number has nowhere to receive.
   */
  if (!smsConfigured()) found.delete("sms");

  return [...found];
}

/**
 * The number this business texts from.
 *
 * Null means it has none of its own and falls back to ours, which is fine for
 * sending and useless for receiving — a reply to a shared number arrives with
 * no way of telling whose customer it is. So this being null is a sign the
 * business is only half set up, not a normal state to stay in.
 */
export async function smsNumberFor(
  supabase: SupabaseClient,
  studioId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("channel_connections")
    .select("external_id")
    .eq("studio_id", studioId)
    .eq("channel", "sms")
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  // Same reasoning as above: a number we could not look up is not the same as
  // a business without one, and sending from the wrong number is worse than
  // not sending.
  if (error) throw new Error(`could not read the SMS number: ${error.message}`);

  return data?.external_id ?? null;
}

/**
 * What a message on this channel needs in order to leave as this business.
 *
 * A text goes from the business's own number, or a reply to it arrives with
 * no way of telling whose customer it is. A WhatsApp, Instagram or Messenger
 * message has to name the account it is sent from and carry that account's
 * token — which lives in a table only the server can read, so this takes the
 * server's client. Without these, an owner replying from the inbox sent texts
 * from our shared number and could not send on Meta at all.
 */
export async function sendingAs(
  admin: SupabaseClient,
  studioId: string,
  channel: string,
): Promise<{ from?: string | null; metaAccountId?: string | null; metaToken?: string | null }> {
  if (channel === "sms") return { from: await smsNumberFor(admin, studioId) };
  if (channel !== "whatsapp" && channel !== "instagram" && channel !== "messenger") return {};

  const { data: connection } = await admin
    .from("channel_connections")
    .select("id, external_id")
    .eq("studio_id", studioId)
    .eq("channel", channel)
    .eq("active", true)
    .limit(1)
    .maybeSingle();
  if (!connection) return {};

  const { data: secret } = await admin
    .from("channel_secrets")
    .select("access_token")
    .eq("connection_id", connection.id)
    .maybeSingle();

  return { metaAccountId: connection.external_id, metaToken: secret?.access_token ?? null };
}
