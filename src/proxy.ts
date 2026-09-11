import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { hasSupabaseEnv, supabaseEnv } from "@/lib/env";

// Routes reachable without a session. The widget is embedded on the studio's
// own site, so it and its endpoint must stay open.
const PUBLIC_PATHS = [
  "/login",
  // An invitation is opened by somebody who is not a member yet.
  "/join",
  /*
   * Reached from a reset link, which normally arrives with a session already
   * exchanged. Open anyway so an expired or reused link can say so — bounced
   * to /login it would look like the link had simply done nothing. Safe
   * without a session: changing a password needs one, and the page has none
   * to offer.
   */
  "/reset-password",
  // The pitch, and the two pages Meta's reviewer will ask for.
  "/home",
  "/privacy",
  "/terms",
  /*
   * The second product's own sales page.
   *
   * Left off this list it is not a broken page — it is a sales page that
   * bounces every visitor to a password box, which is worse, because nothing
   * says so and the link looks like it works.
   */
  "/family-app",
  // Who is behind this, which is the page a cautious buyer goes looking for.
  "/company",
  /*
   * The map and the rules, which a crawler fetches before anything else.
   *
   * Behind the session check they answer with a redirect to a sign-in page,
   * and a search engine reads that as a site with no sitemap at all — which is
   * the state this was in until now.
   */
  "/sitemap.xml",
  "/robots.txt",
  "/auth",
  "/widget",
  "/api/widget",
  "/pay",
  "/api/stripe",
  // Guarded by CRON_SECRET rather than a session, because a scheduler calls it.
  "/api/cron",
  // Same secret, same reason: a deploy check has no session to sign in with.
  "/api/health",
  // A calendar app cannot log in. The 64-character token in the URL is the
  // credential, and the route refuses anything that is not one.
  "/api/calendar",
  /*
   * Twilio has no session and never will. Both routes prove the request came
   * from Twilio by its signature before they read a word of it, which is a
   * stronger credential than a cookie and the same argument as the secret on
   * /api/cron.
   *
   * Without this the whole inbound half of text messaging was unreachable:
   * every text a customer sent was answered with a redirect to our login page,
   * and Twilio logged an error nobody was watching. It has been that way since
   * the SMS webhook was written and went unnoticed because no business has a
   * number connected yet — the first one to connect would have found that
   * texts simply vanished.
   */
  "/api/sms",
  "/api/voice",
  // Guarded by EMAIL_WEBHOOK_SECRET, and refuses everything when it is unset.
  // A mail provider has no session either.
  "/api/email",
  /*
   * Meta, for WhatsApp, Messenger and Instagram. Same argument again: no
   * session, and a stronger credential than one — every delivery is signed
   * with the app secret and checked against the raw bytes before it is read,
   * and nothing at all is accepted while that secret is unset.
   *
   * Added with the route rather than after it, because this list is exactly
   * what made the whole inbound half of text messaging unreachable for weeks:
   * the webhook was answered with a redirect to our login page and the error
   * went into somebody else's logs.
   */
  "/api/meta",
];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Before .env.local is filled in, pass everything through rather than 500 on
  // every route. The page itself then reports what is missing.
  if (!hasSupabaseEnv()) return response;

  const { url: supabaseUrl, anonKey } = supabaseEnv();

  const supabase = createServerClient(
    supabaseUrl,
    anonKey,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          toSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refreshes the auth token and writes it back onto the response.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  /*
   * The root is two different pages depending on who is asking: the inbox for
   * a business, and the pitch for everyone else. Rewritten rather than
   * redirected so the address bar still just says the domain — a marketing
   * page that bounces you to /home looks broken.
   */
  if (!user && pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/home";
    return NextResponse.rewrite(url);
  }

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // Anything served straight out of /public is exempt. Matching on a file
  // extension rather than a list of names means a new static asset is not
  // silently auth-gated the way demo.html was.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|js|css|html|txt|xml|json|woff2?|webmanifest)$).*)",
  ],
};
