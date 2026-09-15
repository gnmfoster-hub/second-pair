import { NextResponse, type NextRequest } from "next/server";
import { requireStudio } from "@/lib/studio";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * A paper form, kept against the customer.
 *
 * Plenty of forms will still be signed on a clipboard at the desk — a walk-in,
 * a phone that died, a customer who would rather. The signed sheet then lives
 * in a drawer, and the drawer is not searchable, not backed up and not
 * something anybody can find eighteen months later when it matters. A photo
 * or a PDF on their record is all three.
 *
 * A route rather than a server action, because a phone photo is several
 * megabytes and server actions refuse anything over one.
 */
const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "application/pdf": "pdf",
};

export async function POST(request: NextRequest) {
  let studio;
  let userId;
  try {
    ({ studio, userId } = await requireStudio());
  } catch {
    return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  }

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Nothing arrived." }, { status: 400 });

  const contactId = String(form.get("contact_id") ?? "").trim();
  const title = String(form.get("title") ?? "").trim().slice(0, 120) || "Paper form";
  const file = form.get("file");

  if (!(file instanceof File) || !file.size) {
    return NextResponse.json({ error: "Choose a photo or a PDF." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "That file is over 15MB. Take the photo again at a smaller size." }, { status: 413 });
  }
  const extension = ALLOWED[file.type];
  if (!extension) {
    return NextResponse.json({ error: "A photo or a PDF, please." }, { status: 415 });
  }

  const supabase = await createClient();

  // Theirs, checked against this business rather than trusted from the form.
  const { data: contact } = await supabase
    .from("contacts")
    .select("id")
    .eq("id", contactId)
    .eq("studio_id", studio.id)
    .maybeSingle();
  if (!contact) return NextResponse.json({ error: "That person is not in this business." }, { status: 404 });

  const path = `${studio.id}/${contact.id}/${crypto.randomUUID()}.${extension}`;
  const admin = createAdminClient();
  const { error: upError } = await admin.storage
    .from("forms")
    .upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: false });

  if (upError) {
    const missing = /bucket not found/i.test(upError.message);
    return NextResponse.json(
      { error: missing ? "Forms need a database update before files can be kept." : "It did not upload. Try again." },
      { status: missing ? 503 : 500 },
    );
  }

  const { error } = await supabase.from("client_forms").insert({
    studio_id: studio.id,
    contact_id: contact.id,
    title,
    status: "paper",
    file_path: path,
    file_name: file.name.slice(0, 200),
    file_type: file.type,
    signed_at: new Date().toISOString(),
    created_by: userId,
  });

  if (error) {
    await admin.storage.from("forms").remove([path]);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
