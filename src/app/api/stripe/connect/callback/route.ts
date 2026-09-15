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
  const code = params.get("code");

  /*
   * The state first, before anything else is decided.
   *
   * It is signed with whichever secret started the flow, so trying both and
   * keeping the one that verifies is also how the mode is learned. And it says
   * where somebody came from — their own page or the business's — which every
   * outcome below needs, including the failures. Reading it only after an
   * error had already been handled is how a refusal from somebody's own page
   * used to send them to the business settings, where the message sat on a
   * screen they were not looking at.
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

  const home = state?.artist ? "/settings/you" : "/settings";

  /*
   * Stripe saying no, which is not the same as somebody saying no.
   *
   * Every error came back as "cancelled" — "Nothing was connected, you
   * cancelled on Stripe, no harm done" — whatever Stripe had actually said. So
   * a flow that failed at Stripe's end reported that the person had changed
   * their mind, which reads as it having gone fine. Only access_denied is a
   * person pressing cancel; anything else is a fault, and its reason goes back
   * with it.
   */
  const stripeError = params.get("error");
  if (stripeError) {
    const detail = params.get("error_description") ?? stripeError;
    if (stripeError === "access_denied") return back(request, "cancelled", home);
    console.error("[stripe connect] Stripe returned an error", stripeError, detail);
    return back(request, "refused", home, detail);
  }

  /*
   * No secret at all is ours to fix; a secret that simply did not sign this
   * state is a stale or altered link, and pressing connect again fixes it.
   * These were one answer, so an expired link told the business card payments
   * were not switched on — which was not true and not theirs to act on.
   */
  if (!secretFor("live") && !secretFor("test")) return back(request, "not-configured", home);
  if (!secret || !code || !state) return back(request, "expired", home);

  let accountId: string;
  try {
    /*
     * The secret sent both ways Stripe accepts it.
     *
     * Its OAuth reference shows the key as a client_secret field or as basic
     * auth; this sent only a Bearer header, which is how the rest of the API
     * authenticates and is not what this endpoint documents. Belt and braces
     * on the one request that decides whether a connection exists at all.
     */
    const response = await fetch("https://connect.stripe.com/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Bearer ${secret}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_secret: secret,
      }),
    });

    const body = (await response.json().catch(() => ({}))) as {
      stripe_user_id?: string;
      error?: string;
      error_description?: string;
    };

    if (!response.ok || !body.stripe_user_id) {
      const detail = body.error_description ?? body.error ?? `Stripe answered ${response.status}`;
      console.error("[stripe connect] token exchange refused", response.status, detail);
      return back(request, "refused", home, detail);
    }
    accountId = body.stripe_user_id;
  } catch (e) {
    const detail = e instanceof Error ? e.message : "Stripe could not be reached";
    console.error("[stripe connect] token exchange failed", detail);
    return back(request, "refused", home, detail);
  }

  /*
   * Written with the service key, because the person finishing this is coming
   * back from Stripe rather than from a page of ours, and their session cookie
   * may not survive the round trip in every browser. The business is the one
   * named in the state, which was signed before they left.
   */
  const db = createAdminClient();

  /*
   * Onto the person, or onto the business — whichever the signed state says —
   * and checked that something was actually written.
   *
   * An update matching no rows is not an error to PostgREST: it succeeds, having
   * changed nothing. So this could report "connected" with no account saved
   * anywhere, and the only sign was a settings page still saying there was no
   * Stripe. Asking for the rows back makes "nothing matched" a failure with a
   * sentence, rather than a success with a lie in it.
   */
  const { data: saved, error } = state.artist
    ? await db
        .from("artists")
        .update({ stripe_account_id: accountId })
        .eq("id", state.artist)
        .eq("studio_id", state.studio)
        .select("id")
    : await db
        .from("studios")
        .update({ stripe_account_id: accountId })
        .eq("id", state.studio)
        .select("id");

  if (error || !saved?.length) {
    const detail = error
      ? error.message
      : "Stripe connected the account, but it could not be saved against this business.";
    console.error("[stripe connect] could not save", accountId, detail);
    return back(request, "refused", home, detail);
  }

  return back(request, "connected", home);
}

function back(request: NextRequest, why: string, to = "/settings", detail?: string) {
  const url = new URL(to, request.url);
  url.searchParams.set("stripe", why);
  // Stripe's own words, where it gave any. Trimmed: it is shown, not stored.
  if (detail) url.searchParams.set("detail", detail.slice(0, 200));
  return NextResponse.redirect(url);
}
