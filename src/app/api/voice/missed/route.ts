import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifySignature } from "@/lib/messaging/sms";
import { sendSms } from "@/lib/messaging/sms";
import { wasMissed, missedCallText } from "@/lib/messaging/missedCall";
import { whatTheyHear } from "@/lib/voice/voicemail";
import { takeAMessage } from "@/lib/voice/twiml";
import { hasColumn } from "@/lib/db/hasColumn";
import { writeCall, seconds } from "@/lib/voice/writeCall";

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

  const caller = params.From;
  const to = request.nextUrl.searchParams.get("to") ?? params.To;
  if (!caller || !to) return empty();

  const db = createAdminClient();
  const { data: connection } = await db
    .from("channel_connections")
    .select("studio_id, artist_id, studios(name, channels_allowed), artists(name)")
    .in("channel", ["sms", "voice"])
    .eq("external_id", to)
    .eq("active", true)
    // Limited before it is narrowed to one: two rows for the same number would
    // otherwise come back as an error, be read as "nobody owns this", and drop
    // a real customer's call without a word.
    .limit(1)
    .maybeSingle();

  if (!connection) return empty();

  const studio = connection.studios as unknown as {
    name: string;
    channels_allowed: string[] | null;
  } | null;
  const person = connection.artists as unknown as { name: string } | null;

  /*
   * What the call cost us, written down before anything else can fail.
   *
   * The leg out to the owner's mobile is the dear one and it has been running
   * since this feature was built, on every business with a ring-me number,
   * appearing on no screen anywhere. A cost nobody can see is a cost nobody
   * can price, and what to charge for the telephone is the open question.
   */
  const answered = !wasMissed(params.DialCallStatus);

  await writeCall(db, {
    studioId: connection.studio_id,
    callSid: params.CallSid,
    from: caller,
    to,
    rangSeconds: seconds(params.DialCallDuration),
    forwarded: Boolean(params.DialCallStatus),
    answered,
  });

  /*
   * Somebody picked the phone up. Nothing more to do — a text after a call
   * they have just had would be an odd thing to receive.
   *
   * It is counted first, and that is the change: this used to return before
   * anything was written down, and an answered call is the dearest of the lot.
   * Two legs running for the length of an actual conversation, where a missed
   * one is two rounded-up minutes. The cheapest outcome to read about was the
   * most expensive one to have, and it was the one we had no record of.
   */
  if (answered) return empty();

  /*
   * Whether the telephone is part of what this business bought.
   *
   * Voice is its own channel and its own price: a call costs more than a dozen
   * texts before anybody speaks. Without it the number still rings their phone
   * — that is their line, not ours to switch off — but nothing else happens:
   * no text back, no answerphone, and none of the model or carriage that go
   * with them.
   */
  const sold = (studio?.channels_allowed ?? ["web"]).includes("voice");
  if (!sold) return empty();

  /*
   * Whether they are about to be offered the answerphone, decided before a
   * word of the text is written.
   *
   * The text goes out as the call is handed over, so it lands while the caller
   * is still speaking — and it used to tell them to type out what they need,
   * in the same second they were saying it. It now offers both and asks for
   * neither twice, which it can only do if this is known first.
   *
   * Read with its own query rather than joined above: the column does not
   * exist until its migration is run, and naming it in the join would have
   * PostgREST refuse the whole lookup — which is every missed call on the
   * platform, on two real businesses, going nowhere.
   */
  const voicemail =
    (await hasColumn(db, "studios", "voicemail")) &&
    (
      await db
        .from("studios")
        .select("voicemail")
        .eq("id", connection.studio_id)
        .maybeSingle()
    ).data?.voicemail === true;

  const body = missedCallText(
    studio?.name ?? "us",
    person?.name?.split(" ")[0] ?? null,
    voicemail,
  );

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
    /*
     * Marked failed where it failed.
     *
     * The words said "not delivered" and the row did not, so everything that
     * counts messages — the meter that bills for texts, the figures on the
     * report — counted a text that never left as one that went. Billing a
     * business for a message their customer never got is the kind of small
     * wrong that is very hard to argue with later.
     */
    delivery: delivered ? "sent" : "failed",
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

  if (!voicemail) return empty();

  const said = whatTheyHear(studio?.name ?? null, person?.name?.split(" ")[0] ?? null);

  /*
   * ninety seconds, and hash to finish.
   *
   * Long enough for somebody to describe a job and short enough that a phone
   * left in a pocket does not record the drive home. `playBeep` because people
   * wait for one, and a four-second silence ends it for anybody who rang off.
   */
  return twiml(takeAMessage(said, to));
}

/** The only place a TwiML string becomes an answer. See lib/voice/twiml. */
function twiml(body: string) {
  return new NextResponse(body, { headers: { "Content-Type": "text/xml" } });
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
