import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { hasSupabaseEnv, supabaseEnv } from "@/lib/env";

// Routes reachable without a session. The widget is embedded on the studio's
// own site, so it and its endpoint must stay open.
const PUBLIC_PATHS = [
  "/login",
  "/auth",
  "/widget",
  "/api/widget",
  "/pay",
  "/api/stripe",
  // Guarded by CRON_SECRET rather than a session, because a scheduler calls it.
  "/api/cron",
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
