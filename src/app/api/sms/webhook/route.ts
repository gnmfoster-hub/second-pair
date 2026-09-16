import { NextResponse, after, type NextRequest } from "next/server";
import { runTurn } from "@/lib/engine/run";
import { hasAnthropicEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifySignature, sendSms } from "@/lib/messaging/sms";
import { recordDelivery } from "@/lib/messaging/deliver";
import { isStopWord, isStartWord, recordOptOut, clearOptOut } from "@/lib/messaging/optOut";
import { handOverAfterFailure } from "@/lib/engine/turnFailed";

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
  const { data: connection, error: lookupFailed } = await db
    .from("channel_connections")
    .select("studio_id, artist_id, studios(slug)")
    .eq("channel", "sms")
    .eq("external_id", to)
    .eq("active", true)
    .maybeSingle();

  /*
   * A database we could not read is worth a retry; a number nobody owns is
   * not.
   *
   * Both came back as the same silent 200 with empty TwiML, so a connection
   * blip meant a customer's text was never recorded, never answered, and
   * never counted anywhere. Twilio will redeliver a 500, which is exactly
   * what should happen to a message we failed to take.
   */
  if (lookupFailed) {
    console.error("[sms] could not look up the number", lookupFailed.message);
    return new NextResponse("could not look up the number", { status: 500 });
  }

  const studio = connection?.studios as unknown as { slug: string } | null;
  if (!studio?.slug) return empty();

  // Media arrives as numbered fields rather than a list.
  const media: string[] = [];
  for (let i = 0; i < Number(params.NumMedia ?? 0); i++) {
    const url = params[`MediaUrl${i}`];
    if (url) media.push(url);
  }

  /*
   * STOP means stop, before anything else looks at it.
   *
   * It went to the assistant like any other message and got an answer, and
   * nothing remembered it, so the reminders kept coming. Now it is recorded
   * against this business and nothing is said back — the carrier's own
   * confirmation is the reply. START undoes it.
   */
  if (connection?.studio_id && isStopWord(body)) {
    await recordOptOut(db, connection.studio_id, from);
    return empty();
  }
  if (connection?.studio_id && isStartWord(body)) {
    await clearOptOut(db, connection.studio_id, from);
    return empty();
  }

  if (!hasAnthropicEnv()) return empty();

  /*
   * Once per text, however many times Twilio delivers it.
   */
  const sid = params.MessageSid ?? params.SmsSid;
  if (sid) {
    const { error: seen } = await db
      .from("handled_messages")
      .insert({ message_id: `sms:${sid}`, channel: "sms" });

    // A duplicate means we have already answered this one. Any other error
    // means the claim did not happen, and answering anyway risks replying
    // twice to the same text — so it goes back for a retry instead.
    if (seen?.code === "23505") return empty();
    if (seen) {
      console.error("[sms] could not claim the message", seen.message);
      return new NextResponse("could not claim the message", { status: 500 });
    }
  }

  /*
   * Answered after Twilio has been told "got it", not while it waits.
   *
   * The reply used to go back inside this response. Twilio waits fifteen
   * seconds for one, and a turn that looks at the diary and works out a price
   * takes longer than that often enough — so Twilio gave up, the reply was
   * thrown away, and the thread showed the customer as answered while their
   * phone showed nothing. Now the text is acknowledged at once and the reply
   * is sent as its own message, from the number they texted.
   */
  after(async () => {
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
      if (result.paused || !result.reply) return;

      const delivery = await sendSms({ to: from, from: to, body: result.reply });

      const { data: message } = await db
        .from("messages")
        .select("id")
        .eq("conversation_id", result.conversationId)
        .eq("role", "assistant")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (message) await recordDelivery(db, message.id, delivery);

      if (delivery.status === "failed") {
        throw new Error(delivery.error ?? "The text did not send.");
      }
    } catch (error) {
      // Silence is better than an error going to a customer as a text message —
      // but the owner is told, and the thread handed over.
      if (connection?.studio_id) {
        await handOverAfterFailure(db, { studioId: connection.studio_id, channel: "sms", externalRef: from, error });
      }
    }
  });

  return empty();
}

/** Twilio accepts an empty response as "nothing to say". */
function empty() {
  return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    headers: { "Content-Type": "text/xml" },
  });
}
