import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

/**
 * Reference images from the chat widget. Files land in the private `references`
 * bucket under <studio_id>/<conversation_id>/, which is what the storage policy
 * and the GDPR erasure path both key on.
 */
export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Invalid upload" }, { status: 400 });

  const studioSlug = String(form.get("studio") ?? "").trim();
  const session = String(form.get("session") ?? "").trim();
  const file = form.get("file");

  if (!studioSlug || !/^[A-Za-z0-9_-]{16,64}$/.test(session)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "That image is too large (8MB max)." }, { status: 413 });
  }
  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json({ error: "Images only, please." }, { status: 415 });
  }

  const db = createAdminClient();

  const { data: studio } = await db
    .from("studios")
    .select("id")
    .eq("slug", studioSlug)
    .maybeSingle();
  if (!studio) return NextResponse.json({ error: "Unknown studio" }, { status: 404 });

  // Only attach to a conversation that already exists for this session, so an
  // upload cannot be used to create rows on its own.
  const { data: conversation } = await db
    .from("conversations")
    .select("id")
    .eq("studio_id", studio.id)
    .eq("external_ref", session)
    .maybeSingle();
  if (!conversation) {
    return NextResponse.json({ error: "Send a message first" }, { status: 409 });
  }

  const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${studio.id}/${conversation.id}/${crypto.randomUUID()}.${extension}`;

  const { error } = await db.storage
    .from("references")
    .upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: false });

  if (error) {
    console.error("[widget/upload]", error);
    return NextResponse.json({ error: "Upload failed. Try again." }, { status: 500 });
  }

  return NextResponse.json({ path });
}
