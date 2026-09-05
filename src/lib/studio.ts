import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Artist, Faq, PriceBand, ServiceOption, Studio } from "@/lib/types";
import { isPlatformAdmin } from "./platform";

/**
 * The studio the signed-in user belongs to. MVP assumes one studio per user;
 * when that stops being true this reads a cookie instead of taking the first row.
 */
export async function requireStudio(): Promise<{
  studio: Studio;
  userEmail: string;
  /** Who is asking. Needed wherever a row belongs to a person, not the business. */
  userId: string;
}> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership, error: lookupFailed } = await supabase
    .from("studio_members")
    .select("studio_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  /*
   * A lookup that failed is not somebody without a business.
   *
   * The error was discarded, so a database blip made an established owner look
   * like a new signup — and the next thing this function does with somebody
   * who has no business is send them to onboarding to create one. They would
   * arrive at "name your business" while their own sat untouched, and filling
   * it in would give them a second.
   *
   * Throwing shows the ordinary error page, which is true and recoverable: a
   * reload once the database answers puts them back where they were.
   */
  if (lookupFailed) {
    throw new Error(`Could not look up which business you belong to: ${lookupFailed.message}`);
  }

  if (!membership) {
    /*
     * A platform administrator does not have a business of their own.
     *
     * Without this they land on the onboarding flow and are asked to name their
     * salon and pick a trade, which is the one thing that account exists not to
     * do. Sending them to the back office is where they were going anyway.
     */
    if (await isPlatformAdmin()) redirect("/admin");
    redirect("/onboarding");
  }

  const { data: studio } = await supabase
    .from("studios")
    .select("*")
    .eq("id", membership.studio_id)
    .single();

  if (!studio) redirect("/onboarding");

  return { studio: studio as Studio, userEmail: user.email ?? "", userId: user.id };
}

export async function getArtists(studioId: string): Promise<Artist[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("artists")
    .select("*")
    .eq("studio_id", studioId)
    .order("created_at");
  return (data ?? []) as Artist[];
}

export async function getPriceBands(studioId: string): Promise<PriceBand[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("price_bands")
    .select("*")
    .eq("studio_id", studioId)
    .order("sort_order");
  return (data ?? []) as PriceBand[];
}

export async function getServiceOptions(studioId: string): Promise<ServiceOption[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("service_options")
    .select("*")
    .eq("studio_id", studioId)
    .order("sort_order");
  return (data ?? []) as ServiceOption[];
}

export async function getFaqs(studioId: string): Promise<Faq[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("faqs")
    .select("*")
    .eq("studio_id", studioId)
    .order("sort_order");
  return (data ?? []) as Faq[];
}
