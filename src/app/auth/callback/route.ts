import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safeNext";

/**
 * Where a confirmation or sign-in link lands.
 *
 * Every new customer passes through here exactly once, and if it sends them
 * somewhere wrong they cannot get into the account they just made — with no
 * obvious way to try again, because the link is spent.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");

  /*
   * The public address, not the one the container sees.
   *
   * Behind Vercel's proxy `nextUrl.origin` can carry the internal host or plain
   * http, which sends somebody who signed up on www.second-pair.com to a
   * different origin — where their session cookie does not exist, so they
   * arrive logged out and the link cannot be used again.
   */
  const host =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    request.nextUrl.host;
  const proto =
    request.headers.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  const origin = `${proto}://${host}`;

  // Only ever a path on this site. Tested in safeNext.test.ts, because the one
  // route that hands out sessions is not the place to eyeball a regex.
  const next = safeNext(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
