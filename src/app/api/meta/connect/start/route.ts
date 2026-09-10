import { NextResponse, type NextRequest } from "next/server";
import { requireStudio } from "@/lib/studio";
import { createClient } from "@/lib/supabase/server";
import { signState, newNonce, authoriseUrl } from "@/lib/messaging/metaConnect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sends a business off to Facebook to agree.
 *
 * Signed in as the owner, or nothing happens: connecting an account decides
 * who can message this business's customers, and that is not a decision for
 * whoever happens to be at the front desk.
 */
export async function GET(request: NextRequest) {
  const appId = process.env.META_APP_ID;
  const secret = process.env.META_APP_SECRET;

  if (!appId || !secret) {
    return back(request, "not-configured");
  }

  let studioId: string;
  try {
    const { studio } = await requireStudio();
    studioId = studio.id;
  } catch {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  /*
   * The owner, not just a member.
   *
   * A stylist connecting the shop's Facebook Page would be connecting the
   * business's front door, and the business belongs to whoever owns it.
   */
  if (!(await isOwner())) {
    return back(request, "owner-only");
  }

  /*
   * Signed, so the trip back can be trusted.
   *
   * This is the only thing tying the return leg to the person who started it
   * and to the business they were allowed to connect. The app secret does the
   * signing — it never leaves the server, and it is already required for this
   * to work at all.
   */
  const state = signState({ studioId, nonce: newNonce(), at: Date.now() }, secret);

  return NextResponse.redirect(
    authoriseUrl({ appId, redirectUri: redirectUri(request), state }),
  );
}

export function redirectUri(request: NextRequest): string {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}/api/meta/connect/callback`;
}

function back(request: NextRequest, why: string) {
  const url = new URL("/settings/install", request.url);
  url.searchParams.set("meta", why);
  return NextResponse.redirect(url);
}

async function isOwner(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data } = await supabase
    .from("studio_members")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  return data?.role === "owner";
}
