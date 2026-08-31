import { NextResponse, type NextRequest } from "next/server";
import { runTurn } from "@/lib/engine/run";
import { hasAnthropicEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifySignature } from "@/lib/messaging/sms";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * A text message arriving.
 *
 * Twilio posts here when somebody texts one of our numbers. The number they
 * texted says which business it is for, so every business needs its own — a
 * shared number would arrive here with no way of telling whose customer this
 * is, which is the reason the guidance is one number each.
 *
 * The reply goes back in the response itself rather than as a second API call.
 * It is one round trip instead of two, and it means a reply cannot be sent
 * without the incoming message having been recorded first.
 */
export async function POST(request: NextRequest) {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token) return empty();

  const form = await request.formData();
  const params: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") params[key] = value;
  }

  /*
   * Proving it came from Twilio, before anything is written down.
   *
   * Without this the endpoint is a public way to put words in a customer's
   * mouth: invent a From and a Body and the assistant answers, and can be
   * talked into holding a slot. The URL has to be the one Twilio signed, which
   * behind a proxy is the forwarded host rather than the internal one.
   */
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const url = `${proto}://${host}${request.nextUrl.pathname}`;

  const genuine = verifySignature({
    authToken: token,
    url,
    params,
    signature: request.headers.get("x-twilio-signature"),
  });

  if (!genuine) {
    return new NextResponse("Signature did not match.", { status: 403 });
  }

  const from = params.From;
  const to = params.To;
  const body = (params.Body ?? "").trim();
  if (!from || !to) return empty();

  const db = createAdminClient();

  /*
   * Whose number they texted.
   *
   * No row, no business — and 200 rather than an error, because Twilio retries
   * a failure and there is nothing here that a retry would fix.
   */
  const { data: connection } = await db
    .from("channel_connections")
    .select("studio_id, artist_id, studios(slug)")
    .eq("channel", "sms")
    .eq("external_id", to)
    .eq("active", true)
    .maybeSingle();

  const studio = connection?.studios as unknown as { slug: string } | null;
  if (!studio?.slug) return empty();

  // Media arrives as numbered fields rather than a list.
  const media: string[] = [];
  for (let i = 0; i < Number(params.NumMedia ?? 0); i++) {
    const url = params[`MediaUrl${i}`];
    if (url) media.push(url);
  }

  if (!hasAnthropicEnv()) return empty();

  try {
    const result = await runTurn({
      studioSlug: studio.slug,
      // Their number is the thread. Sessions are scoped per business, so the
      // same person texting two of our salons gets two conversations.
      sessionKey: from,
      channel: "sms",
      origin: `${proto}://${host}`,
      message: body || "(sent a picture)",
      mediaUrls: media,
      // A number belonging to one person means every text to it is for them,
      // and the assistant must not ask who they want.
      forArtistId: connection?.artist_id ?? undefined,
    });

    /*
     * Nothing goes back when the assistant is paused.
     *
     * Somebody has taken this conversation over by hand, and a text arriving
     * from the robot in the middle of that is worse than silence — the owner
     * is already typing.
     */
    if (result.paused || !result.reply) return empty();

    return twiml(result.reply);
  } catch {
    // Recorded, but unanswerable. Silence is better than an error going to a
    // customer as a text message.
    return empty();
  }
}

/** Twilio accepts an empty response as "nothing to say". */
function empty() {
  return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    headers: { "Content-Type": "text/xml" },
  });
}

function twiml(message: string) {
  return new NextResponse(
    `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(message)}</Message></Response>`,
    { headers: { "Content-Type": "text/xml" } },
  );
}

/**
 * Escapes the five characters XML cares about.
 *
 * A customer writing "table & chairs <3" would otherwise produce a document
 * Twilio cannot parse, and the reply would silently never arrive.
 */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
