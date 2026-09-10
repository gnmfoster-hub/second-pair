import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { readState, accountsFrom, type ConnectedAccount } from "@/lib/messaging/metaConnect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GRAPH = "https://graph.facebook.com/v21.0";

/**
 * Facebook sending them back, having agreed or not.
 *
 * Everything that arrives here is from the customer's browser rather than
 * from Facebook directly, so none of it is trusted on its face: the state has
 * to verify, and the code is exchanged server to server with the app secret
 * before a single thing is written down.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.META_APP_SECRET;
  const appId = process.env.META_APP_ID;
  if (!secret || !appId) return done(request, "not-configured");

  const params = request.nextUrl.searchParams;

  /*
   * They pressed cancel, which is not a failure.
   *
   * Facebook sends error=access_denied. Saying "something went wrong" to
   * somebody who deliberately changed their mind is how a product loses the
   * benefit of the doubt.
   */
  if (params.get("error")) return done(request, "cancelled");

  const state = readState(params.get("state") ?? "", secret);
  if (!state) return done(request, "expired");

  const code = params.get("code");
  if (!code) return done(request, "no-code");

  try {
    /*
     * The code for a token, server to server.
     *
     * This is where the app secret earns its keep: the code alone is useless
     * to anybody who intercepted the redirect, because exchanging it needs a
     * secret that never leaves here.
     */
    const exchanged = await fetch(
      `${GRAPH}/oauth/access_token?` +
        new URLSearchParams({
          client_id: appId,
          client_secret: secret,
          redirect_uri: `${request.nextUrl.origin}/api/meta/connect/callback`,
          code,
        }),
      { signal: AbortSignal.timeout(15000) },
    );

    if (!exchanged.ok) return done(request, "exchange-failed");
    const { access_token: userToken } = (await exchanged.json()) as {
      access_token?: string;
    };
    if (!userToken) return done(request, "exchange-failed");

    /*
     * What they actually ticked.
     *
     * Asked for with the Instagram account attached, because a business that
     * connects a Page almost always means the Instagram on it too, and asking
     * twice is a second round trip for the same answer.
     */
    const listed = await fetch(
      `${GRAPH}/me/accounts?` +
        new URLSearchParams({
          fields: "id,name,access_token,instagram_business_account{id,username}",
          access_token: userToken,
        }),
      { signal: AbortSignal.timeout(15000) },
    );

    if (!listed.ok) return done(request, "no-pages");

    const accounts = accountsFrom(await listed.json());
    if (!accounts.length) return done(request, "no-pages");

    await store(state.studioId, accounts);

    return done(request, "connected");
  } catch {
    return done(request, "exchange-failed");
  }
}

/**
 * Writing the connections down.
 *
 * The token goes in its own table, which has no access policies at all — the
 * server reads it and nothing else can, because a Page token is a password
 * and channel_connections is readable by everybody on the team.
 */
async function store(studioId: string, accounts: ConnectedAccount[]) {
  const db = createAdminClient();

  for (const account of accounts) {
    /*
     * Reconnecting replaces rather than duplicates.
     *
     * A business whose token expired presses the button again, and they should
     * end up with the same channel working, not two rows fighting over which
     * one answers.
     */
    const { data: existing } = await db
      .from("channel_connections")
      .select("id")
      .eq("studio_id", studioId)
      .eq("channel", account.channel)
      .eq("external_id", account.externalId)
      .limit(1)
      .maybeSingle();

    const row = {
      studio_id: studioId,
      channel: account.channel,
      external_id: account.externalId,
      label: account.label,
      active: true,
    };

    const id = existing?.id
      ? ((await db.from("channel_connections").update(row).eq("id", existing.id)),
        existing.id)
      : (
          await db.from("channel_connections").insert(row).select("id").single()
        ).data?.id;

    if (!id) continue;

    await db
      .from("channel_secrets")
      .upsert(
        { connection_id: id, access_token: account.token, app_id: process.env.META_APP_ID },
        { onConflict: "connection_id" },
      );
  }
}

/** Back to where they pressed the button, with a word about what happened. */
function done(request: NextRequest, outcome: string) {
  const url = new URL("/settings/install", request.url);
  url.searchParams.set("meta", outcome);
  return NextResponse.redirect(url);
}
