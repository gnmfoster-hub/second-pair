import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStudio } from "@/lib/studio";
import { toCsv } from "@/lib/csv";
import { netOf } from "@/lib/payments/whoTakes";
import { hasColumn } from "@/lib/db/hasColumn";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Every payment, as the file somebody does their tax return from.
 *
 * The whole reason the payments table records our own copy of what Stripe
 * knows. An accountant wants gross, fee and net, per person, for a date range,
 * in one place — and a chair renter wants exactly that for herself without
 * being handed the whole salon's takings or a Stripe login she has no business
 * having.
 *
 * So it takes `?person=` and, for anybody who is not the owner, ignores what
 * it was asked for and gives them their own. A file is the easiest thing in a
 * product to over-share: it leaves in one piece, it gets forwarded, and
 * nothing about it says who it was meant for.
 *
 * Fee and net come out empty where Stripe has not told us yet, which is
 * honest — an empty cell is a question an accountant knows how to ask, and a
 * zero is a wrong answer they will not think to.
 */
export async function GET(request: Request) {
  const { studio, userId } = await requireStudio();
  const supabase = await createClient();

  if (!(await hasColumn(supabase, "payments", "gross_pence"))) {
    return NextResponse.json(
      { error: "Payments are not switched on for this business yet." },
      { status: 400 },
    );
  }

  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  /*
   * Who this file is for.
   *
   * The owner may ask for anybody, or for everybody. Everybody else gets
   * themselves whatever the address says — checked here rather than trusted
   * from the query string, because the query string is a thing anybody can
   * type.
   */
  const { data: membership } = await supabase
    .from("studio_members")
    .select("role")
    .eq("studio_id", studio.id)
    .eq("user_id", userId)
    .maybeSingle();

  const owns = membership?.role === "owner";

  const { data: me } = await supabase
    .from("artists")
    .select("id, name")
    .eq("studio_id", studio.id)
    .eq("user_id", userId)
    .maybeSingle();

  const asked = url.searchParams.get("person");
  const personId = owns ? asked : (me?.id ?? null);

  if (!owns && !personId) {
    return NextResponse.json(
      { error: "Your sign-in is not linked to anybody in the diary." },
      { status: 403 },
    );
  }

  let query = supabase
    .from("payments")
    .select("paid_at, kind, status, method, description, gross_pence, fee_pence, net_pence, artists(name), contacts(name)")
    .eq("studio_id", studio.id)
    .order("paid_at", { ascending: false });

  if (personId) query = query.eq("artist_id", personId);
  if (from) query = query.gte("paid_at", from);
  if (to) query = query.lte("paid_at", to);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: "Could not read the takings — try again." }, { status: 500 });
  }

  const rows = (data ?? []) as unknown as {
    paid_at: string | null;
    kind: string;
    status: string;
    method: string | null;
    description: string | null;
    gross_pence: number | null;
    fee_pence: number | null;
    net_pence: number | null;
    artists: { name: string } | null;
    contacts: { name: string } | null;
  }[];

  const day = (iso: string | null) =>
    iso
      ? new Intl.DateTimeFormat("en-GB", {
          timeZone: studio.timezone,
          dateStyle: "short",
        }).format(new Date(iso))
      : "";

  /*
   * Pounds and pence as a plain number, not "£42.00".
   *
   * This is opened in a spreadsheet and added up. A currency symbol in the
   * cell makes it text, and a column of text sums to nothing — which is the
   * single most annoying thing an export can do to somebody at the end of a
   * quarter.
   */
  const money = (pence: number | null | undefined) =>
    pence == null ? "" : (pence / 100).toFixed(2);

  const csv = toCsv(
    ["Date", "Who", "Client", "What", "Kind", "How paid", "Status", "Gross", "Fee", "Net"],
    rows.map((r) => [
      day(r.paid_at),
      r.artists?.name ?? "The business",
      r.contacts?.name ?? "",
      r.description ?? "",
      r.kind,
      r.method ?? "",
      r.status,
      money(r.gross_pence),
      money(r.fee_pence),
      money(r.net_pence ?? netOf(r.gross_pence ?? 0, r.fee_pence)),
    ]),
  );

  const whose = personId
    ? (owns ? rows[0]?.artists?.name : me?.name) ?? "person"
    : studio.name;

  const name = `takings-${whose}-${new Date().toISOString().slice(0, 10)}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");

  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${name}.csv"`,
    },
  });
}
