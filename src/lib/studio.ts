import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Artist, Faq, PriceBand, ServiceOption, Studio } from "@/lib/types";

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

  const { data: membership } = await supabase
    .from("studio_members")
    .select("studio_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!membership) redirect("/onboarding");

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
