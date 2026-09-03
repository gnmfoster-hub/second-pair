import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
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

  /*
   * The other kind of link: one made for somebody rather than by them.
   *
   * A link the back office generates is created on the server, so the browser
   * that eventually opens it never stored the code verifier that
   * exchangeCodeForSession needs. It cannot succeed — not sometimes, ever —
   * and every one of those links landed on the login page saying "auth", which
   * looks exactly like a link that expired.
   *
   * These carry a hashed token instead, redeemed here. Same destination, and
   * still one use only.
   */
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
