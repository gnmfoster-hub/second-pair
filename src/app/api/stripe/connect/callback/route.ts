import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { readState } from "@/lib/payments/connect";
import { secretFor, type StripeMode } from "@/lib/payments/stripe";

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
  const params = request.nextUrl.searchParams;

  // They pressed cancel on Stripe's screen, which is not an error.
  if (params.get("error")) return back(request, "cancelled");

  const code = params.get("code");

  /*
   * Which Stripe sent them back, worked out from the state they carry.
   *
   * The state is signed with whichever secret started the flow, so trying
   * both and keeping the one that verifies is also how we learn the mode —
   * and it has to be this way round, because the state is the only thing that
   * says which business this is and it cannot be trusted until it is checked.
   *
   * Both halves stay together after that: a code minted in test mode is
   * exchanged against the test secret and nowhere else.
   */
  let secret: string | undefined;
  let state: ReturnType<typeof readState> = null;

  for (const mode of ["live", "test"] as StripeMode[]) {
    const candidate = secretFor(mode);
    if (!candidate) continue;
    const read = readState(params.get("state") ?? "", candidate);
    if (read) {
      secret = candidate;
      state = read;
      break;
    }
  }

  if (!secret) return back(request, "not-configured");
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

  /*
   * Onto the person, or onto the business — whichever the signed state says.
   *
   * Scoped to the studio as well as the id, even though the id is a uuid and
   * the state was signed. The state proves which business began this; the
   * extra condition means that even a state naming the wrong person could not
   * attach an account to somebody in another salon, which is the one mistake
   * here that nobody would ever notice.
   */
  const { error } = state.artist
    ? await db
        .from("artists")
        .update({ stripe_account_id: accountId })
        .eq("id", state.artist)
        .eq("studio_id", state.studio)
    : await db.from("studios").update({ stripe_account_id: accountId }).eq("id", state.studio);

  // Back where they started, which for one of the team is their own page.
  return back(
    request,
    error ? "refused" : "connected",
    state.artist ? "/settings/you" : "/settings",
  );
}

function back(request: NextRequest, why: string, to = "/settings") {
  const url = new URL(to, request.url);
  url.searchParams.set("stripe", why);
  return NextResponse.redirect(url);
}
