import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { seedFromPack } from "@/lib/seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Filling a demo business with its own trade's services, words and questions.
 *
 * The demo-making script is a plain script and the seeding is inside the app,
 * so this is the join between them. It exists for one reason: a demo of a
 * garage or a dog groomer has to be seeded exactly the way a real business of
 * that trade is, or it proves nothing about whether the product fits that
 * trade at all.
 *
 * Two locks, because this writes with the server's own access. The shared
 * secret the scheduled job already uses, and — whatever that says — it refuses
 * anything that is not marked as a demo. A business with real customers in it
 * is never touched from here.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const given = (request.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "No" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { studio?: string; vertical?: string }
    | null;
  const studioId = body?.studio ?? "";
  const vertical = body?.vertical ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(studioId) || !vertical) {
    return NextResponse.json({ error: "Which business, and which trade?" }, { status: 400 });
  }

  const db = createAdminClient();
  const { data: studio } = await db
    .from("studios")
    .select("id, name, kind")
    .eq("id", studioId)
    .maybeSingle();

  if (!studio) return NextResponse.json({ error: "No such business" }, { status: 404 });
  if (studio.kind !== "demo") {
    return NextResponse.json(
      { error: `${studio.name} is not a demo, so this refuses to touch it.` },
      { status: 403 },
    );
  }

  const result = await seedFromPack(db, studioId, vertical);
  return NextResponse.json(result);
}
