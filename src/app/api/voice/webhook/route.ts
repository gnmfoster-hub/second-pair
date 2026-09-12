import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { shouldRing } from "@/lib/channels/phoneNumbers";
import { verifySignature } from "@/lib/messaging/sms";

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
  if (!token) return hangUp();

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
  if (!to) return hangUp();

  const db = createAdminClient();
  const { data: connection } = await db
    .from("channel_connections")
    .select("forward_to, studios(name)")
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
  if (!connection) return hangUp();

  const studio = connection.studios as unknown as { name: string } | null;

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
    return twiml(
      `<Say voice="alice">Thanks for calling${studio?.name ? " " + escapeXml(studio.name) : ""}. ` +
        `We cannot take your call right now, so I will text you straight back.</Say>` +
        `<Redirect method="POST">/api/voice/missed?to=${encodeURIComponent(to)}</Redirect>`,
    );
  }

  /*
   * Fifteen seconds, because the real competition is their voicemail.
   *
   * Twilio cannot tell a person from an answerphone: voicemail picking up is
   * reported as "completed", which reads as answered, so no text is sent and
   * the caller leaves a message nobody listens to. That is the exact outcome
   * this feature exists to prevent, and at twenty seconds it was a race
   * against a UK mobile's voicemail — which usually starts between fifteen and
   * twenty.
   *
   * Fifteen is still three or four rings, which is long enough to reach a
   * phone in a pocket and short enough to get there first. Anybody who wants
   * no ring at all clears the ring-me number instead, and the text goes out
   * immediately.
   *
   * callerId is the number they dialled, so the business sees its own line
   * calling and knows to answer it as work.
   */
  return twiml(
    `<Dial timeout="15" callerId="${escapeXml(to)}" ` +
      `action="/api/voice/missed?to=${encodeURIComponent(to)}" method="POST">` +
      `<Number>${escapeXml(connection.forward_to)}</Number>` +
      `</Dial>`,
  );
}

function twiml(body: string) {
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, {
    headers: { "Content-Type": "text/xml" },
  });
}

/** Nothing to say and nobody to say it to. */
function hangUp() {
  return twiml("<Hangup/>");
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
