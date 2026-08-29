import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
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
    .select("name, slug")
    .eq("slug", slug)
    .maybeSingle();

  if (!studio) notFound();

  return <ChatWindow slug={studio.slug} studioName={studio.name} />;
}
