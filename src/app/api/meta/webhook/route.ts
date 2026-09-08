import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runTurn } from "@/lib/engine/run";
import { hasAnthropicEnv } from "@/lib/env";
import {
  readMetaEvents,
  verifyMetaSignature,
  verificationReply,
  sendMeta,
  type MetaEvent,
} from "@/lib/messaging/meta";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * WhatsApp, Messenger and Instagram, all arriving here.
 *
 * Meta sends one webhook for every product on the app, so this is three
 * channels wearing one address. What tells them apart is the payload shape and
 * the account the message arrived at, both of which lib/messaging/meta reads.
 *
 * Unlike Twilio, the reply does not go back in the response — it is a separate
 * call to the Graph API afterwards. So this answers Meta only when it is
 * finished, which means slow turns can be retried. That is handled by writing
 * the message id down before doing anything with it.
 */

/**
 * The handshake, which Meta does once when the address is first saved.
 *
 * It arrives as a GET with a token we chose. Returning the challenge in plain
 * text, and only when the token matches, is the whole of it — and getting it
 * wrong is the reason a webhook refuses to save with no useful error.
 */
export async function GET(request: NextRequest) {
  const expected = process.env.META_VERIFY_TOKEN ?? "";
  const challenge = verificationReply(request.nextUrl.searchParams, expected);

  if (challenge === null) {
    return new NextResponse("Not authorised", { status: 403 });
  }

  return new NextResponse(challenge, {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}

export async function POST(request: NextRequest) {
  const appSecret = process.env.META_APP_SECRET;

  /*
   * With no secret set, nothing is accepted.
   *
   * An open endpoint here lets anybody put words in a customer's mouth and
   * have the assistant answer them, on the business's own account. Refusing
   * everything until it is configured is the only safe way to be half set up.
   */
  if (!appSecret) {
    return new NextResponse("Not configured", { status: 503 });
  }

  /*
   * The raw bytes, because that is what was signed.
   *
   * Parsing and re-serialising changes whitespace and key order, and the
   * signature would never match again.
   */
  const raw = await request.text();

  if (
    !verifyMetaSignature({
      appSecret,
      rawBody: raw,
      header: request.headers.get("x-hub-signature-256"),
    })
  ) {
    return new NextResponse("Signature did not match.", { status: 403 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    // Meaningless to retry, so it is accepted and dropped.
    return ok();
  }

  const events = readMetaEvents(payload);
  if (!events.length) return ok();

  const db = createAdminClient();
  const origin = `${request.headers.get("x-forwarded-proto") ?? "https"}://${
    request.headers.get("x-forwarded-host") ?? request.headers.get("host")
  }`;

  for (const event of events) {
    try {
      await handle(db, event, origin);
    } catch {
      /*
       * One bad message must not lose the others.
       *
       * A delivery can carry several people's messages, and throwing here
       * would return a failure for all of them and have Meta resend the lot.
       */
    }
  }

  return ok();
}

type Db = ReturnType<typeof createAdminClient>;

async function handle(db: Db, event: MetaEvent, origin: string) {
  /*
   * Written down before it is acted on.
   *
   * Meta gives a webhook about twenty seconds and resends anything slower, and
   * a reply that needs the model can take longer on a bad day. The primary key
   * refuses the second copy, so a retry stops here rather than after the
   * customer has been answered twice.
   */
  if (event.messageId) {
    const { error } = await db
      .from("handled_messages")
      .insert({ message_id: event.messageId, channel: event.channel });
    // 23505 is the duplicate: this exact message has already been dealt with.
    if (error?.code === "23505") return;
  }

  /*
   * Whose account they messaged.
   *
   * A connection with an artist_id belongs to that person — her own Instagram
   * — and every enquiry arriving there is hers, so the assistant must not ask
   * who they would like.
   */
  const { data: connection } = await db
    .from("channel_connections")
    .select("id, studio_id, artist_id, studios(slug)")
    .eq("channel", event.channel)
    .eq("external_id", event.accountId)
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  const studio = connection?.studios as unknown as { slug: string } | null;
  if (!connection || !studio?.slug) return;

  if (!hasAnthropicEnv()) return;

  const result = await runTurn({
    studioSlug: studio.slug,
    /*
     * Their Meta id is the thread, and it is scoped per business already:
     * the same person messaging two of our salons gets two conversations,
     * because Meta issues a different id per page.
     */
    sessionKey: event.personId,
    channel: event.channel,
    origin,
    message: event.text || "(sent a picture)",
    mediaUrls: event.media,
    forArtistId: connection.artist_id ?? undefined,
  });

  /*
   * Nothing goes back when a person has taken the conversation over.
   *
   * The owner is already typing. A message from the assistant arriving in the
   * middle of that is worse than silence.
   */
  if (result.paused || !result.reply) return;

  const { data: secret } = await db
    .from("channel_secrets")
    .select("access_token")
    .eq("connection_id", connection.id)
    .maybeSingle();

  await sendMeta({
    channel: event.channel,
    accountId: event.accountId,
    personId: event.personId,
    token: secret?.access_token ?? "",
    body: result.reply,
  });
}

/**
 * Meta wants a 200 and nothing else.
 *
 * Anything other than success is a retry, and almost nothing here would be
 * fixed by being sent again — so the failures that matter are recorded rather
 * than reported back.
 */
function ok() {
  return new NextResponse("ok", { status: 200 });
}
