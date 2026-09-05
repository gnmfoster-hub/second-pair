import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStudio } from "@/lib/studio";
import { toCsv } from "@/lib/csv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Their client list, as a spreadsheet.
 *
 * A business's customers are its own, and it should never need to ask us for
 * them or be unable to leave with them. This is the practical version of that:
 * a file they can open, mail-merge from, or hand to whatever they use next.
 *
 * Their own session, so it can only ever be their own clients.
 */
export async function GET() {
  const { studio } = await requireStudio();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("contacts")
    .select("name, phone, email, instagram_handle, marketing_consent, notes, created_at")
    .eq("studio_id", studio.id)
    .order("name");

  /*
   * An empty file is not an empty client list.
   *
   * Handing somebody a spreadsheet with only headings, when the read failed,
   * tells them they have no customers — and this is exactly the file somebody
   * downloads when they are thinking about leaving.
   */
  if (error) {
    return NextResponse.json({ error: "Could not read your clients — try again." }, { status: 500 });
  }

  const csv = toCsv(
    ["Name", "Phone", "Email", "Instagram", "Marketing", "Notes", "First seen"],
    (data ?? []).map((c) => [
      c.name,
      c.phone,
      c.email,
      c.instagram_handle,
      c.marketing_consent ? "Agreed" : "No",
      c.notes,
      c.created_at ? new Date(c.created_at).toLocaleDateString("en-GB") : null,
    ]),
  );

  const today = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${studio.slug}-clients-${today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
