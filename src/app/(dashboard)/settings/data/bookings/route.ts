import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStudio } from "@/lib/studio";
import { toCsv } from "@/lib/csv";
import { formatPence } from "@/lib/money";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Every appointment, as a spreadsheet.
 *
 * What it was worth, who it was with, whether it was cancelled — the file
 * somebody wants at the end of a quarter, and the one an accountant asks for.
 * Cancelled entries are included and marked rather than left out: "why is
 * March short" is a worse question than a column saying so.
 */
export async function GET() {
  const { studio } = await requireStudio();
  const supabase = await createClient();

  /*
   * Scoped to their own people, explicitly.
   *
   * Bookings carry no studio_id — they reach a business through the person
   * they are with — so an unfiltered read here leans entirely on row-level
   * security to keep one salon's diary out of another's export. That policy is
   * in place and was tested, but a file that hands over every appointment in
   * the system is not the place to depend on one thing being right.
   */
  const { data: people } = await supabase
    .from("artists")
    .select("id")
    .eq("studio_id", studio.id);

  const mine = (people ?? []).map((a) => a.id);
  if (!mine.length) {
    return NextResponse.json({ error: "Nobody is set up yet, so there is nothing to export." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("bookings")
    .select("starts_at, ends_at, type, price_pence, deposit_amount_pence, deposit_status, cancelled_at, attended, artists(name), contacts(name)")
    .in("artist_id", mine)
    .order("starts_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Could not read your diary — try again." }, { status: 500 });
  }

  const at = (iso: string | null) =>
    iso
      ? new Intl.DateTimeFormat("en-GB", {
          timeZone: studio.timezone,
          dateStyle: "short",
          timeStyle: "short",
        }).format(new Date(iso))
      : "";

  const csv = toCsv(
    ["When", "Ends", "Who", "With", "Kind", "Price", "Deposit", "Deposit status", "Attended", "Cancelled"],
    (data ?? []).map((b) => [
      at(b.starts_at),
      at(b.ends_at),
      (b.contacts as unknown as { name: string } | null)?.name ?? "",
      (b.artists as unknown as { name: string } | null)?.name ?? "",
      b.type,
      b.price_pence ? formatPence(b.price_pence) : "",
      b.deposit_amount_pence ? formatPence(b.deposit_amount_pence) : "",
      b.deposit_status,
      b.attended == null ? "" : b.attended ? "Yes" : "No",
      b.cancelled_at ? at(b.cancelled_at) : "",
    ]),
  );

  const today = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${studio.slug}-bookings-${today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
