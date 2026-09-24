import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifySignature } from "@/lib/messaging/sms";
import { hangUp, sayAndListen, sayAndFinish } from "@/lib/voice/twiml";
import { onTheCall, whatToSay } from "@/lib/voice/whatItMayDo";
import { runTurn } from "@/lib/engine/run";
import { siteOrigin } from "@/lib/origin";

export const runtime = "nodejs";

/**
 * One turn of a conversation on the telephone.
 *
 * Twilio has listened to whatever the caller just said, turned it into words,
 * and posted them here. We decide what to say back and hand over the next
 * listen — turn by turn until somebody rings off or the assistant is finished.
 *
 * The brain is the one that already answers texts. runTurn takes a channel and
 * a session key and knows nothing about how the words arrived, so the phone
 * gets the same prices, the same diary, the same refusals and the same
 * handover to a person as every other way in. A second assistant for the
 * telephone would be a second set of answers to keep in step, and they would
 * not stay in step.
 *
 * Keyed on Twilio's CallSid. It is the same on every turn of a call, so the
 * conversation holds together, and it belongs to the call rather than to us —
 * a dropped call leaves nothing behind.
 */
export async function POST(request: NextRequest) {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token) return xml(hangUp());

  const form = await request.formData();
  const params: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") params[key] = value;
  }

  /*
   * Proved to have come from Twilio, exactly as the webhook that rang.
   *
   * Without it this endpoint books appointments in a stranger's diary from a
   * form post — the assistant behind it is the one that can take a booking and
   * ask for a deposit.
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

  const to = params.To;
  const callSid = params.CallSid;
  const said = (params.SpeechResult ?? "").trim();

  if (!to || !callSid) return xml(hangUp());

  const db = createAdminClient();

  /*
   * Whose line was rung, and whether it may talk at all.
   *
   * Read again on every turn rather than trusted from the first: a call can
   * outlast somebody switching the Receptionist off, and the answer to "may
   * this line talk" should be the current one.
   */
  const { data: connection } = await db
    .from("channel_connections")
    .select("artist_id, studios(slug, receptionist_allowed, receptionist_on, receptionist_holds, receptionist_asks_deposit), artists(voice_on)")
    .eq("channel", "sms")
    .eq("external_id", to)
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  const studio = connection?.studios as unknown as
    | {
        slug: string;
        receptionist_allowed: boolean | null;
        receptionist_on: boolean | null;
        receptionist_holds: boolean | null;
        receptionist_asks_deposit: boolean | null;
      }
    | null;

  if (!studio) return xml(hangUp());

  const person = connection?.artists as unknown as { voice_on: boolean | null } | null;

  const may = onTheCall({
    allowed: studio.receptionist_allowed === true,
    /* A line of somebody's own answers on their switch; the shop's on its own. */
    on: connection?.artist_id ? person?.voice_on === true : studio.receptionist_on === true,
    holds: studio.receptionist_holds !== false,
    asksDeposit: studio.receptionist_asks_deposit === true,
  });

  if (!may.answer) {
    /*
     * Switched off mid-call, which is rare and has to end gracefully. Ending
     * the call saying nothing useful is worse than one sentence.
     */
    return xml(
      sayAndFinish("Sorry, I cannot take that right now. I will text you instead."),
    );
  }

  /*
   * Nothing heard.
   *
   * Twilio posts here with an empty SpeechResult when a Gather times out, so
   * this is the ordinary silence case rather than a fault — somebody thinking,
   * or a bad line. Said once and then handed to a text, because a machine
   * asking "are you still there" twice is the thing everybody hates.
   */
  if (!said) {
    return xml(
      sayAndFinish(
        "I did not catch that, so I will text you instead and you can reply whenever you like.",
      ),
    );
  }

  try {
    const result = await runTurn({
      studioSlug: studio.slug,
      /* The call's own id: the same every turn, and gone when the call is. */
      sessionKey: `call:${callSid}`,
      channel: "voice",
      message: said,
      origin: await siteOrigin(),
      forArtistId: connection?.artist_id ?? null,
    });

    const reply = (result.reply ?? "").trim();

    if (!reply) {
      return xml(sayAndFinish(whatToSay(may, null) || "Thanks, I will text you the details."));
    }

    /*
     * Keep listening unless the assistant has plainly finished.
     *
     * Erring towards listening: a caller cut off mid-sentence has to ring
     * back and start again, where a listen that nobody fills ends politely on
     * its own after the Gather times out.
     */
    return xml(sayAndListen(reply, `/api/voice/talk`));
  } catch (error) {
    /*
     * Never a silent drop. The assistant failing is our problem and the caller
     * should still get an answer they can act on — the text back is the thing
     * this product did before it could talk at all.
     */
    console.error("[voice/talk]", (error as Error)?.message);
    return xml(
      sayAndFinish("Sorry, something went wrong at our end. I will text you instead."),
    );
  }
}

/** The only place a TwiML string becomes an answer. See lib/voice/twiml. */
function xml(body: string) {
  return new NextResponse(body, {
    status: 200,
    headers: { "content-type": "text/xml; charset=utf-8" },
  });
}
