import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { readState } from "@/lib/payments/connect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stripe sending them back, connected.
 *
 * The code is exchanged here rather than in the browser: it is worth a token
 * that can charge on their behalf, and it must never travel through a page.
 *
 * The business is taken from the signed state, never from a query parameter —
 * without that, anybody could connect their own Stripe account to somebody
 * else's business and collect their deposits.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) return back(request, "not-configured");

  const params = request.nextUrl.searchParams;

  // They pressed cancel on Stripe's screen, which is not an error.
  if (params.get("error")) return back(request, "cancelled");

  const code = params.get("code");
  const state = readState(params.get("state") ?? "", secret);

  if (!code || !state) return back(request, "expired");

  let accountId: string;
  try {
    const response = await fetch("https://connect.stripe.com/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Bearer ${secret}`,
      },
      body: new URLSearchParams({ grant_type: "authorization_code", code }),
    });

    const body = (await response.json()) as {
      stripe_user_id?: string;
      error_description?: string;
    };

    if (!response.ok || !body.stripe_user_id) return back(request, "refused");
    accountId = body.stripe_user_id;
  } catch {
    return back(request, "refused");
  }

  /*
   * Written with the service key, because the person finishing this is coming
   * back from Stripe rather than from a page of ours, and their session cookie
   * may not survive the round trip in every browser. The business is the one
   * named in the state, which was signed before they left.
   */
  const db = createAdminClient();
  const { error } = await db
    .from("studios")
    .update({ stripe_account_id: accountId })
    .eq("id", state.studio);

  return back(request, error ? "refused" : "connected");
}

function back(request: NextRequest, why: string) {
  const url = new URL("/settings", request.url);
  url.searchParams.set("stripe", why);
  return NextResponse.redirect(url);
}
