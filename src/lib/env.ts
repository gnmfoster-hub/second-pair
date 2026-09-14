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

/**
 * Whether a business can be sent off to connect its own Stripe account.
 *
 * Two different keys, and the difference matters. STRIPE_SECRET_KEY is what
 * charges a card; STRIPE_CONNECT_CLIENT_ID is what lets somebody else's
 * business attach their Stripe to ours in the first place. A deployment with
 * the first and not the second reports "payments: yes" and cannot connect a
 * single account — which is exactly the state this has been in.
 *
 * Ours, not the business's: one value for the whole platform, from Second
 * Pair's own Stripe under Settings → Connect. There is deliberately nowhere
 * for a salon owner to type it. It is not theirs, it is the same value for
 * every business on here, and a box on one business's settings page would
 * imply both the opposite things.
 */
export function canConnectStripe(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_CONNECT_CLIENT_ID);
}
