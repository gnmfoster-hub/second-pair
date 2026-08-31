import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { verticalPack } from "@/lib/verticals";
import { ChatWindow } from "./ChatWindow";

// The widget is embedded in an iframe on the studio's own site.
export default async function WidgetPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const db = createAdminClient();
  const { data: studio } = await db
    .from("studios")
    .select("name, slug, vertical, greeting")
    .eq("slug", slug)
    .maybeSingle();

  if (!studio) notFound();

  return (
    <ChatWindow
      slug={studio.slug}
      studioName={studio.name}
      // The business's own wording wins; the trade pack is the fallback so a
      // new signup is never greeted by a blank line.
      greeting={studio.greeting?.trim() || verticalPack(studio.vertical).greeting}
    />
  );
}
