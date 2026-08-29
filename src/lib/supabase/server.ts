import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { supabaseEnv } from "@/lib/env";

/** Supabase client for server components and server actions. Runs as the signed-in user, so RLS applies. */
export async function createClient() {
  const cookieStore = await cookies();

  const { url, anonKey } = supabaseEnv();

  return createServerClient(
    url,
    anonKey,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            toSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a server component, where cookies are read-only.
            // The middleware refreshes the session instead.
          }
        },
      },
    },
  );
}
