import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
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
  if (!connection.forward_to) {
    return twiml(
      `<Say voice="alice">Thanks for calling${studio?.name ? " " + escapeXml(studio.name) : ""}. ` +
        `We cannot take your call right now, so I will text you straight back.</Say>` +
        `<Redirect method="POST">/api/voice/missed?to=${encodeURIComponent(to)}</Redirect>`,
    );
  }

  /*
   * Twenty seconds, and their own number shown as the caller.
   *
   * Long enough to get to a ringing phone, short enough that somebody who
   * cannot answer is texted while they are still thinking about the business
   * rather than four rings later. callerId is the number they dialled, so the
   * business sees its own line calling and knows to answer it as work.
   */
  return twiml(
    `<Dial timeout="20" callerId="${escapeXml(to)}" ` +
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
