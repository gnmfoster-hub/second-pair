import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifySignature, sendSms } from "@/lib/messaging/sms";
import { recordDelivery } from "@/lib/messaging/deliver";
import { runTurn } from "@/lib/engine/run";
import { hasAnthropicEnv } from "@/lib/env";
import { readTranscript, asMessage, voicemailKey } from "@/lib/voice/voicemail";
import { handOverAfterFailure } from "@/lib/engine/turnFailed";
import { writeCall, seconds } from "@/lib/voice/writeCall";

export const runtime = "nodejs";

/**
 * What they said, answered.
 *
 * Twilio calls this once it has transcribed the message left at the end of an
 * unanswered call. From here it is an ordinary enquiry: the words go into the
 * same thread the caller's number already owns, the assistant answers them,
 * and the answer goes back as a text from the number they rang. A voicemail
 * becomes a booking without anybody listening to it.
 *
 * Not deferred with after(): Twilio is not waiting on a reply it will use, and
 * the empty answer below goes back immediately anyway. Doing the work inline
 * keeps the failure visible in one place.
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
   * Proved to have come from Twilio, the same as every other line in.
   *
   * Without it this endpoint is a way to put words into any business's inbox
   * as though a customer had said them, and to have the assistant act on them.
   */
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

  /*
   * The recording goes, whatever else happens.
   *
   * We wanted what they said, not a library of people's voices. Deleted first
   * so that an error further down cannot leave one behind — and done even when
   * the transcript is unusable, because that recording is the one least worth
   * keeping and the most awkward to be found holding.
   */
  await deleteRecording(params.RecordingSid);

  const said = readTranscript(params.TranscriptionStatus, params.TranscriptionText);

  const { data: connection } = await db
    .from("channel_connections")
    .select("studio_id, artist_id, studios(slug)")
    .in("channel", ["sms", "voice"])
    .eq("external_id", to)
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  if (!connection) return empty();

  /*
   * The recording's own meter, whatever the words turned out to be.
   *
   * Written before the transcript is judged: a message that transcribed to
   * nothing still cost us a recorded minute and a transcribed one, and those
   * are the two dearest rates on the platform. Counting only the useful ones
   * would understate the telephone exactly where it matters.
   */
  await writeCall(db, {
    studioId: connection.studio_id,
    callSid: params.CallSid,
    from: caller,
    to,
    recordedSeconds: seconds(params.RecordingDuration),
    transcribed: true,
  });

  if (!said) return empty();

  /*
   * Once per recording, however many times Twilio delivers the callback.
   *
   * Claimed before the assistant runs, the same as a text — answering a
   * voicemail twice means two different times offered for the same job.
   */
  const sid = params.RecordingSid ?? params.TranscriptionSid;
  if (sid) {
    const { error: seen } = await db
      .from("handled_messages")
      .insert({ message_id: voicemailKey(sid), channel: "sms" });
    if (seen?.code === "23505") return empty();
    if (seen) {
      console.error("[voicemail] could not claim the message", seen.message);
      return new NextResponse("could not claim the message", { status: 500 });
    }
  }

  if (!hasAnthropicEnv()) return empty();

  const studio = connection.studios as unknown as { slug: string } | null;
  if (!studio?.slug) return empty();

  try {
    const result = await runTurn({
      studioSlug: studio.slug,
      // Their number is the thread — the same one the missed-call text went to,
      // so the assistant answers with that already said above it.
      sessionKey: caller,
      channel: "sms",
      origin: `${proto}://${host}`,
      message: asMessage(said),
      forArtistId: connection.artist_id ?? undefined,
    });

    // Somebody has taken this conversation over by hand. The words are in the
    // thread for them to read, which is the part that matters.
    if (result.paused || !result.reply) return empty();

    const delivery = await sendSms({ to: caller, from: to, body: result.reply });

    const { data: message } = await db
      .from("messages")
      .select("id")
      .eq("conversation_id", result.conversationId)
      .eq("role", "assistant")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (message) await recordDelivery(db, message.id, delivery);

    if (delivery.status === "failed") throw new Error(delivery.error ?? "The text did not send.");
  } catch (error) {
    // The caller has already had the "sorry we missed you" text, so silence
    // here is not silence to them — but the owner is told, and the thread
    // handed over with the transcript sitting in it.
    await handOverAfterFailure(db, {
      studioId: connection.studio_id,
      channel: "sms",
      externalRef: caller,
      error,
    });
  }

  return empty();
}

/**
 * Deleting the recording from Twilio.
 *
 * Their copy is the only copy — we never download it — so this is the whole of
 * our retention policy for somebody's voice, and it is "not at all". Failure
 * is logged rather than thrown: a recording we could not delete must not also
 * cost the caller their answer.
 */
async function deleteRecording(sid: string | undefined): Promise<void> {
  const account = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !account || !token) return;

  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${account}/Recordings/${sid}.json`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Basic ${Buffer.from(`${account}:${token}`).toString("base64")}`,
        },
      },
    );
    if (!response.ok && response.status !== 404) {
      console.error("[voicemail] could not delete the recording", response.status);
    }
  } catch (error) {
    console.error("[voicemail] could not delete the recording", (error as Error)?.message);
  }
}

function empty() {
  return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    headers: { "Content-Type": "text/xml" },
  });
}
