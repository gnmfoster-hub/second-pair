import type { SupabaseClient } from "@supabase/supabase-js";
import type { Channel } from "@/lib/types";
import { emailConfigured } from "./email";

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

  return [...found];
}
