/**
 * Supabase credentials, checked once with a message that says what to do.
 * Without this a missing .env.local surfaces as an opaque 500 on every route.
 */

const SETUP_HINT =
  "Supabase is not configured. Copy .env.example to .env.local and fill in " +
  "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY from your project's API settings.";

export function supabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error(SETUP_HINT);
  return { url, anonKey };
}

export function hasSupabaseEnv(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/** The conversation engine needs its own credential, separate from Supabase. */
export function hasAnthropicEnv(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}
