import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client. Bypasses RLS.
 *
 * Only for code paths with no signed-in user: channel webhooks (WhatsApp,
 * Instagram, the web widget), the conversation engine, Stripe webhooks and
 * scheduled jobs. Never import this into anything the dashboard renders.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
