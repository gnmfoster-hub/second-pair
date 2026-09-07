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
    // Limited before it is narrowed to one: two rows for the same number would
    // otherwise come back as an error, be read as "nobody owns this", and drop
    // a real customer's call without a word.
    .limit(1)
    .maybeSingle();

  if (!connection) return empty();

  const studio = connection.studios as unknown as { name: string } | null;
  const person = connection.artists as unknown as { name: string } | null;
  const body = missedCallText(studio?.name ?? "us", person?.name?.split(" ")[0] ?? null);

  /*
   * The thread first, because whether to say anything depends on it.
   *
   * A missed call is an enquiry — somebody wanted something enough to ring —
   * and it belongs in the inbox whatever happens next. It is keyed the way a
   * text message is, on the caller's own number, so their reply lands here
   * rather than starting again.
   */
  const thread = await findOrStart(db, connection.studio_id, connection.artist_id, caller);
  if (!thread) return empty();

  await note(db, thread.id, `Missed call from ${caller}.`);

  /*
   * Nothing automatic goes out on a thread somebody has taken over.
   *
   * The same rule the text webhook has kept from the start, and it was missing
   * here. A customer halfway through a conversation with the owner rings, gets
   * no answer, and receives "tell me what you need and I can help here" from
   * the assistant — in the middle of being helped by a person. Worse than
   * silence, and it undercuts the owner in front of their own customer.
   *
   * They still see the call: it is noted above and flagged below, which is the
   * part that actually matters to somebody already typing.
   */
  if (thread.paused) {
    await note(db, thread.id, "No text sent — you have taken this conversation over.");
    await flag(db, thread.id);
    return empty();
  }

  const sent = await sendSms({ to: caller, body, from: to });
  const delivered = sent.status === "sent" || sent.status === "delivered";

  await db.from("messages").insert({
    conversation_id: thread.id,
    role: "assistant",
    content: delivered ? body : `${body}

(Not delivered: ${sent.error ?? "unknown"})`,
  });

  /*
   * Only when the text did not go.
   *
   * A missed call that has been answered by text needs nobody: the customer
   * has been spoken to and the assistant takes it from their reply. One that
   * could not be texted is a number sitting there that somebody has to ring,
   * and nothing else in the product would ever say so.
   */
  if (!delivered) await flag(db, thread.id);

  return empty();
}

/**
 * The thread this caller belongs to, started if there is not one yet.
 *
 * Whether the assistant has been stood down on it is read here rather than
 * assumed, because it decides whether anything is said at all.
 */
async function findOrStart(
  db: ReturnType<typeof createAdminClient>,
  studioId: string,
  artistId: string | null,
  caller: string,
): Promise<{ id: string; paused: boolean } | null> {
  const { data: existing } = await db
    .from("conversations")
    .select("id, ai_paused")
    .eq("studio_id", studioId)
    .eq("channel", "sms")
    .eq("external_ref", caller)
    .limit(1)
    .maybeSingle();

  if (existing) return { id: existing.id, paused: Boolean(existing.ai_paused) };

  /*
   * Their number, for free.
   *
   * The one thing the assistant otherwise has to ask a stranger for is on the
   * call itself, so the business can ring back whatever happens next.
   */
  const { data: contact } = await db
    .from("contacts")
    .insert({ studio_id: studioId, channel: "sms", phone: caller })
    .select("id")
    .single();

  const { data: made, error } = await db
    .from("conversations")
    .insert({
      studio_id: studioId,
      contact_id: contact?.id ?? null,
      channel: "sms",
      external_ref: caller,
      artist_id: artistId,
      status: "new",
    })
    .select("id")
    .single();

  if (error || !made) return null;
  return { id: made.id, paused: false };
}

/** A line in the thread that is neither the customer nor the assistant. */
async function note(
  db: ReturnType<typeof createAdminClient>,
  conversationId: string,
  content: string,
) {
  await db.from("messages").insert({ conversation_id: conversationId, role: "system", content });
}

/** Somebody has to look at this one. */
async function flag(db: ReturnType<typeof createAdminClient>, conversationId: string) {
  await db.from("conversations").update({ status: "needs_human" }).eq("id", conversationId);
}

/** Twilio accepts an empty response as "nothing further". */
function empty() {
  return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    headers: { "Content-Type": "text/xml" },
  });
}
