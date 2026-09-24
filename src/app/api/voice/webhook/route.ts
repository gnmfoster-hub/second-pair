import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { shouldRing } from "@/lib/channels/phoneNumbers";
import { verifySignature } from "@/lib/messaging/sms";
import { hangUp, textsOnly, cannotTakeIt, ringThem, sayAndListen } from "@/lib/voice/twiml";
import { mayForward } from "@/lib/ceilings";
import { takesCalls } from "@/lib/voice/takesCalls";

export const runtime = "nodejs";

/**
 * The phone ringing.
 *
 * Twilio calls this the moment somebody dials one of our numbers, and what we
 * answer with decides what happens to the call. The number they dialled says
 * which business it is for, exactly as a text does.
 *
 * The business gets first refusal on its own phone call: it rings their real
 * mobile for twenty seconds, and only if that is not picked up does the caller
 * get a text. Somebody who has not said where to ring is texted straight away,
 * which is a real choice rather than a broken state — plenty of people would
 * rather not have the phone go at all.
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
   * Proved to have come from Twilio before it is acted on, the same as a text.
   *
   * Without it this endpoint is a way to make somebody's phone ring, and to
   * make us send a text to any number a stranger names.
   */
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const url = `${proto}://${host}${request.nextUrl.pathname}`;

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
  if (!to) return xml(hangUp());

  const db = createAdminClient();
  const { data: connection } = await db
    .from("channel_connections")
    .select("forward_to, studio_id, artist_id, studios(name, channels_allowed, call_monthly_cap, receptionist_allowed, receptionist_on), artists(voice_on)")
    .in("channel", ["sms", "voice"])
    .eq("external_id", to)
    .eq("active", true)
    // Limited before it is narrowed to one: two rows for the same number would
    // otherwise come back as an error, be read as "nobody owns this", and drop
    // a real customer's call without a word.
    .limit(1)
    .maybeSingle();

  // A number nobody has claimed. Hanging up is better than a wrong business
  // answering, and Twilio retries nothing that returns cleanly.
  if (!connection) return xml(hangUp());

  const studio = connection.studios as unknown as {
    name: string;
    channels_allowed: string[] | null;
  } | null;

  /*
   * Whether this number does anything with a call at all.
   *
   * The telephone is its own channel and its own price, and unlike the others
   * it costs money before a word is said: the caller's leg, and then the far
   * dearer leg out to the owner's mobile, both rounded up to a whole minute.
   * Ringing a mobile for fifteen seconds costs more than a text.
   *
   * So without it, this is a texting number and says so. Not a hang-up, which
   * reads as broken, and not a forward either — forwarding is the expensive
   * half, and quietly doing the costly part of a channel nobody bought is how
   * a margin disappears.
   */
  if (!takesCalls(studio?.channels_allowed)) {
    return xml(textsOnly(studio?.name ?? null));
  }

  /*
   * A line with a Receptionist answers it, rather than ringing anybody.
   *
   * Before the forward and before the ceiling, because both are about the leg
   * out to a mobile and this call is not going to one. The caller gets the
   * assistant that already answers their texts, through /api/voice/talk.
   *
   * Everything below this line is the voicemail response, unchanged: it is
   * what every business without a Receptionist still gets, which is all of
   * them today.
   */
  const sold = (studio as { receptionist_allowed?: boolean | null } | null)?.receptionist_allowed === true;
  const person = connection.artists as unknown as { voice_on: boolean | null } | null;
  const lineHasOne = connection.artist_id
    ? person?.voice_on === true
    : (studio as { receptionist_on?: boolean | null } | null)?.receptionist_on === true;

  if (sold && lineHasOne) {
    /*
     * The first thing said, and then it listens. Deliberately short: a caller
     * who has just dialled a hairdresser wants to say what they want, not hear
     * a paragraph, and a long greeting is the thing people talk over.
     */
    return xml(
      sayAndListen(
        `Hello, ${studio?.name ?? "the salon"}. How can I help?`,
        "/api/voice/talk",
      ),
    );
  }

  /*
   * Nowhere to ring, so say so and text them.
   *
   * The action URL is called either way, so the missed-call text is sent from
   * one place rather than two — this branch simply arrives there without the
   * phone having rung.
   */
  /*
   * A call that has already been to their phone.
   *
   * A business keeping its own number diverts unanswered calls here, which
   * puts us one hop after a phone that has already rung. Ringing it again
   * would send the call straight back — the two numbers passing it between
   * them, billed each way, until something gives up. `ForwardedFrom` is what
   * the carrier says the call was diverted from.
   */
  if (!shouldRing(connection.forward_to, params.ForwardedFrom, to)) {
    return xml(cannotTakeIt(studio?.name ?? null, to));
  }

  /*
   * And the ceiling, which stops the spend without stopping the call.
   *
   * Giles asked for a limit on calls the way there is one on texts. A call
   * cannot be stopped the way a text can — somebody is ringing a business
   * right now, and refusing them is the worst thing this product could do.
   *
   * So the ceiling stops the expensive half instead. Of a call's four legs the
   * dear one by a distance is this outbound leg to a mobile: a whole minute
   * billed at roughly six times the inbound rate, every time anybody rings,
   * answered or not. Past the ceiling it stops and nothing else changes — the
   * call is answered, the caller is texted back within seconds, a message can
   * still be left. Which is exactly what every business with ring-me empty
   * already gets, by choice.
   *
   * Counted per calendar month. A read that fails for any reason forwards,
   * because being slightly over a self-imposed ceiling is a smaller harm than
   * a business's phone silently not ringing.
   */
  const cap = (studio as { call_monthly_cap?: number | null } | null)?.call_monthly_cap ?? null;
  if (cap !== null && connection.studio_id) {
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);

    const { count, error } = await db
      .from("calls")
      .select("id", { count: "exact", head: true })
      .eq("studio_id", connection.studio_id)
      .eq("forwarded", true)
      .gte("at", monthStart.toISOString());

    if (!error && !mayForward(count ?? 0, cap)) {
      return xml(cannotTakeIt(studio?.name ?? null, to));
    }
  }

  return xml(ringThem(connection.forward_to, to));
}

/** The only place a TwiML string becomes an answer. See lib/voice/twiml. */
function xml(body: string) {
  return new NextResponse(body, { headers: { "Content-Type": "text/xml" } });
}
