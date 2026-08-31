import type { SupabaseClient } from "@supabase/supabase-js";
import type { Channel } from "@/lib/types";
import { emailConfigured } from "./email";
import { smsConfigured } from "./sms";

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
  const { data } = await supabase
    .from("channel_connections")
    .select("channel")
    .eq("studio_id", studioId)
    .eq("active", true);

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
  const { data } = await supabase
    .from("channel_connections")
    .select("external_id")
    .eq("studio_id", studioId)
    .eq("channel", "sms")
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  return data?.external_id ?? null;
}
