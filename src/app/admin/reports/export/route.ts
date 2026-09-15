import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPlatformAdmin } from "@/lib/platform";
import { platformReport, reportCsv } from "@/lib/reports/platform";
import { loadPlatformRows } from "@/lib/reports/loadPlatform";
import { rangeFrom } from "@/lib/reports/range";

export const dynamic = "force-dynamic";

/** The business-by-business report as a spreadsheet, for the same range and filters as the page. */
export async function GET(request: NextRequest) {
  if (!(await isPlatformAdmin())) return new NextResponse("Not found", { status: 404 });

  const q = request.nextUrl.searchParams;
  const range = rangeFrom({ from: q.get("from") ?? undefined, to: q.get("to") ?? undefined, range: q.get("range") ?? undefined });
  const rows = await loadPlatformRows(createAdminClient(), { from: range.fromIso, to: range.toIso });
  const { businesses } = platformReport(rows, { from: range.fromIso, to: range.toIso });

  const showDemos = q.get("test") === "1";
  const trade = q.get("trade");
  const business = q.get("business");
  const kept = businesses.filter(
    (b) =>
      (showDemos || rows.studios.find((s) => s.id === b.id)?.kind !== "demo") &&
      (!trade || b.trade === trade) &&
      (!business || b.id === business),
  );

  return new NextResponse(reportCsv(kept), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="second-pair-report-${range.fromDay}-to-${range.toDay}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
