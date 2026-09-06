import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifySignature } from "@/lib/messaging/sms";
import { sendSms } from "@/lib/messaging/sms";
import { wasMissed, missedCallText } from "@/lib/messaging/missedCall";

export const runtime = "nodejs";

/**
 * The call ended. Whether anybody answered it decides what happens next.
 *
 * Twilio calls this when the Dial finishes, and again when there was no Dial
 * at all — a business that would rather not have the phone ring arrives here
 * immediately. Either way this is the only place a missed-call text is sent.
 *
 * The text goes out from the number they rang, which is the whole point: their
 * reply is an ordinary text message, arrives at the SMS webhook, and the
 * assistant answers it knowing nothing unusual happened. A missed call becomes
 * a conversation without anything having to join the two together afterwards.
 */
export async function POST(request: NextRequest) {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token) return empty();

  const form = await request.formData();
  const params: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") params[key] = value;
  }

  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const url = `${proto}://${host}${request.nextUrl.pathname}${request.nextUrl.search}`;

  if (
    !verifySignature({
      authToken: token,
      url,
      params,
      signature: request.headers.get("x-twilio-signature"),
    })
  ) {
    return new NextResponse("Signature did not match.", { status: 403 });
  }

  // Somebody picked the phone up. Nothing to do, and a text after a call they
  // just had would be an odd thing to receive.
  if (!wasMissed(params.DialCallStatus)) return empty();

  const caller = params.From;
  const to = request.nextUrl.searchParams.get("to") ?? params.To;
  if (!caller || !to) return empty();

  const db = createAdminClient();
  const { data: connection } = await db
    .from("channel_connections")
    .select("studio_id, artist_id, studios(name), artists(name)")
    .in("channel", ["sms", "voice"])
    .eq("external_id", to)
    .eq("active", true)
    .maybeSingle();

  if (!connection) return empty();

  const studio = connection.studios as unknown as { name: string } | null;
  const person = connection.artists as unknown as { name: string } | null;
  const body = missedCallText(studio?.name ?? "us", person?.name?.split(" ")[0] ?? null);

  const sent = await sendSms({ to: caller, body, from: to });

  /*
   * Written down whether or not it went.
   *
   * A missed call is an enquiry — somebody wanted something enough to ring —
   * and it belongs in the inbox even if the text failed, because that is
   * exactly when the owner most needs to see the number and ring back
   * themselves. The thread is keyed the way a text message is, on the caller's
   * own number, so when they reply it lands here rather than starting again.
   */
  await recordIt(db, {
    studioId: connection.studio_id,
    artistId: connection.artist_id,
    caller,
    body,
    delivered: sent.status === "sent" || sent.status === "delivered",
    error: sent.error ?? null,
  });

  return empty();
}

async function recordIt(
  db: ReturnType<typeof createAdminClient>,
  it: {
    studioId: string;
    artistId: string | null;
    caller: string;
    body: string;
    delivered: boolean;
    error: string | null;
  },
) {
  const { data: existing } = await db
    .from("conversations")
    .select("id, contact_id")
    .eq("studio_id", it.studioId)
    .eq("channel", "sms")
    .eq("external_ref", it.caller)
    .maybeSingle();

  let conversationId = existing?.id ?? null;

  if (!conversationId) {
    /*
     * Their number, for free.
     *
     * The one thing the assistant otherwise has to ask a stranger for is on
     * the call itself, so the business can ring back whatever happens next.
     */
    const { data: contact } = await db
      .from("contacts")
      .insert({ studio_id: it.studioId, channel: "sms", phone: it.caller })
      .select("id")
      .single();

    const { data: made, error } = await db
      .from("conversations")
      .insert({
        studio_id: it.studioId,
        contact_id: contact?.id ?? null,
        channel: "sms",
        external_ref: it.caller,
        artist_id: it.artistId,
        status: "new",
      })
      .select("id")
      .single();

    if (error || !made) return;
    conversationId = made.id;
  }

  await db.from("messages").insert({
    conversation_id: conversationId,
    role: "system",
    content: `Missed call from ${it.caller}.`,
  });

  await db.from("messages").insert({
    conversation_id: conversationId,
    role: "assistant",
    content: it.delivered ? it.body : `${it.body}\n\n(Not delivered: ${it.error ?? "unknown"})`,
  });

  /*
   * Only when the text did not go.
   *
   * A missed call that has been answered by text needs nobody: the customer
   * has been spoken to and the assistant takes it from their reply. One that
   * could not be texted is a number sitting there that somebody has to ring,
   * and nothing else in the product would ever say so.
   */
  if (!it.delivered) {
    await db.from("conversations").update({ status: "needs_human" }).eq("id", conversationId);
  }
}

/** Twilio accepts an empty response as "nothing further". */
function empty() {
  return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    headers: { "Content-Type": "text/xml" },
  });
}
