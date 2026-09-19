import { NextResponse, type NextRequest } from "next/server";
import { requireStudio } from "@/lib/studio";
import { createClient } from "@/lib/supabase/server";
import { hasColumn } from "@/lib/db/hasColumn";
import { CONNECT_NONCE_COOKIE } from "@/lib/payments/connect";
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
   * Their own account, or the business's.
   *
   * A stylist connecting the shop's Facebook Page would be connecting the
   * business's front door, and the business belongs to whoever owns it. So the
   * business's accounts stay the owner's to connect.
   *
   * Her own Instagram is a different thing entirely, and the reason is the
   * same one that already governs Stripe on her page: only she can log in to
   * it. An owner cannot connect a stylist's Instagram on her behalf without
   * her password, and should not want to. So somebody connecting their own is
   * allowed, and the connection arrives with their name on it.
   */
  const wantsTheirOwn = request.nextUrl.searchParams.get("mine") === "1";

  let artistId: string | undefined;
  if (wantsTheirOwn) {
    /*
     * Read from the session, never from the request.
     *
     * The browser saying which person this is for would be a way to attach
     * your own Instagram to somebody else's name, which is a way to be sent
     * their customers.
     */
    const me = await meAt(studioId);
    if (!me) return back(request, "not-on-the-team");

    /*
     * Allowed by the owner, checked here and not only in the interface.
     *
     * The button is hidden for somebody who has not been allowed it, and a
     * hidden button is a suggestion: this address can be typed, and connecting
     * points every enquiry arriving on that account at one person's diary and
     * stops the assistant offering anybody else. That is a change to how the
     * business is reached, so it is refused on the server where it cannot be
     * got round.
     */
    if (!(await mayConnectTheirOwn(studioId, me))) {
      return back(request, "not-allowed-for-you");
    }

    artistId = me;
  } else if (!(await isOwner())) {
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
  const nonce = newNonce();
  const state = signState({ studioId, nonce, at: Date.now(), ...(artistId ? { artistId } : {}) }, secret);

  const away = NextResponse.redirect(
    authoriseUrl({ appId, redirectUri: redirectUri(request), state }),
  );

  // And to this browser, so an authorise link passed to somebody else cannot
  // attach their pages to this business.
  away.cookies.set(CONNECT_NONCE_COOKIE, nonce, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 15 * 60,
  });

  return away;
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

/**
 * The artist record belonging to whoever is signed in, on this business.
 *
 * Null for somebody with a login but no chair — an office manager, say — who
 * has nothing for a channel to route to.
 */
async function meAt(studioId: string): Promise<string | undefined> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return undefined;

  const { data } = await supabase
    .from("artists")
    .select("id")
    .eq("studio_id", studioId)
    .eq("user_id", user.id)
    .eq("active", true)
    .maybeSingle();

  return (data?.id as string | undefined) ?? undefined;
}

/**
 * Has the owner allowed this person their own Meta account?
 *
 * Absent column means nobody has, which is every business until the migration
 * runs — so this refuses rather than allows while it is missing. A permission
 * check that defaults to yes when it cannot read the answer is not a
 * permission check.
 */
async function mayConnectTheirOwn(studioId: string, artistId: string): Promise<boolean> {
  const supabase = await createClient();
  if (!(await hasColumn(supabase, "artists", "own_channels"))) return false;

  const { data } = await supabase
    .from("artists")
    .select("own_channels")
    .eq("studio_id", studioId)
    .eq("id", artistId)
    .maybeSingle();

  const allowed = (data?.own_channels as string[] | null) ?? [];
  return allowed.includes("instagram") || allowed.includes("messenger");
}
