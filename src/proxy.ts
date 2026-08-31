import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { hasSupabaseEnv, supabaseEnv } from "@/lib/env";

// Routes reachable without a session. The widget is embedded on the studio's
// own site, so it and its endpoint must stay open.
const PUBLIC_PATHS = [
  "/login",
  // An invitation is opened by somebody who is not a member yet.
  "/join",
  // The pitch, and the two pages Meta's reviewer will ask for.
  "/home",
  "/privacy",
  "/terms",
  "/auth",
  "/widget",
  "/api/widget",
  "/pay",
  "/api/stripe",
  // Guarded by CRON_SECRET rather than a session, because a scheduler calls it.
  "/api/cron",
  // A calendar app cannot log in. The 64-character token in the URL is the
  // credential, and the route refuses anything that is not one.
  "/api/calendar",
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
