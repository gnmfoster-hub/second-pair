import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { verticalPack } from "@/lib/verticals";
import { ChatWindow } from "./ChatWindow";

// The widget is embedded in an iframe on the studio's own site.
export default async function WidgetPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ with?: string }>;
}) {
  const { slug } = await params;
  const { with: handle } = await searchParams;

  const db = createAdminClient();
  const { data: studio } = await db
    .from("studios")
    .select("id, name, slug, vertical, greeting")
    .eq("slug", slug)
    .maybeSingle();

  if (!studio) notFound();

  /*
   * A link with somebody's handle in it means the enquiry is theirs.
   *
   * This is how a salon gives every stylist their own link for their own
   * Instagram bio, while the plain link still reaches the whole shop. Inactive
   * people are ignored, so a stale link in an old bio falls back to the shop
   * rather than booking somebody who has left.
   */
  const { data: person } = handle
    ? await db
        .from("artists")
        .select("id, name")
        .eq("studio_id", studio.id)
        .eq("active", true)
        .ilike("handle", handle)
        .maybeSingle()
    : { data: null };

  return (
    <ChatWindow
      slug={studio.slug}
      studioName={studio.name}
      // The business's own wording wins; the trade pack is the fallback so a
      // new signup is never greeted by a blank line.
      greeting={studio.greeting?.trim() || verticalPack(studio.vertical).greeting}
      forArtistId={person?.id ?? null}
      forArtistName={person?.name ?? null}
    />
  );
}
