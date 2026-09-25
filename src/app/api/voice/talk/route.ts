import { NextResponse, after, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifySignature, sendSms } from "@/lib/messaging/sms";
import { afterCallText } from "@/lib/voice/afterTheCall";
import { recordTurn } from "@/lib/voice/recordCall";
import { tierOf } from "@/lib/voice/howItSounds";
import { hangUp, sayAndListen, sayAndFinish } from "@/lib/voice/twiml";
import { onTheCall, whatToSay } from "@/lib/voice/whatItMayDo";
import { sayable } from "@/lib/voice/sayable";
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
    .select("artist_id, studio_id, studios(slug, name, receptionist_allowed, receptionist_on, receptionist_holds, receptionist_asks_deposit, receptionist_voice), artists(voice_on)")
    .eq("channel", "sms")
    .eq("external_id", to)
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  const studio = connection?.studios as unknown as
    | {
        slug: string;
        name: string | null;
        receptionist_allowed: boolean | null;
        receptionist_on: boolean | null;
        receptionist_holds: boolean | null;
        receptionist_asks_deposit: boolean | null;
        receptionist_voice: string | null;
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
        studio.receptionist_voice,
      ),
    );
  }

  /*
   * Where the second and a half actually goes.
   *
   * Giles, after the first real call: "there was a bit of lag." There is, and
   * it comes from at least four places — Twilio deciding the caller has
   * stopped speaking, the network, our own lookups, the assistant thinking,
   * and Twilio building the audio. Guessing which to attack is how a day gets
   * spent shaving something that was never the problem.
   *
   * So every turn says how long it took and how much of that was the
   * assistant. One line per turn in the logs, and the next real call answers
   * the question.
   */
  const began = Date.now();

  try {
    const thinkingFrom = Date.now();
    const result = await runTurn({
      studioSlug: studio.slug,
      /* The call's own id: the same every turn, and gone when the call is. */
      sessionKey: `call:${callSid}`,
      channel: "voice",
      message: said,
      origin: await siteOrigin(),
      forArtistId: connection?.artist_id ?? null,
    });

    const thought = Date.now() - thinkingFrom;
    const written = (result.reply ?? "").trim();

    if (!written) {
      return xml(sayAndFinish(whatToSay(may, null) || "Thanks, I will text you the details."));
    }

    /*
     * Said out loud, which is not what the assistant wrote.
     *
     * It writes for a screen, because every other channel is one. Giles heard
     * the result on the first real call: it read the privacy link out. Nobody
     * can write down a URL while holding a phone, and every second spent
     * saying one is a second the caller is waiting to say what they rang
     * about.
     *
     * A rule rather than an instruction to the model, because an instruction
     * to never include a link fails on the day it matters. See lib/voice/sayable.
     */
    const { said: reply, links } = sayable(written);

    /*
     * A booking, in writing, which a caller otherwise never gets.
     *
     * The confirmation this product sends after a booking is an email with a
     * calendar file on it, and it needs an email address. Over text or the
     * website people give one; on the telephone there is no natural moment to
     * spell one out, so `sendBookingConfirmation` finds nothing and correctly
     * does nothing — leaving the one channel where the customer cannot scroll
     * back as the one channel with no written record at all.
     *
     * So the number that rang gets a text. Sent from the moment rather than by
     * asking the database again: the day and time on it were already cut in
     * the business's own timezone when the booking was made, which is the part
     * that goes wrong when it is done twice.
     *
     * Held says "pencilled in" rather than "booked". The moment's own flag is
     * about a deposit; `landsAs` is the Receptionist holding what it books for
     * a person to check, which is on by default and is the more likely of the
     * two. Either one means it is not settled yet, and telling somebody
     * they are booked when they are not is how they arrive at a shut door.
     */
    const booked = result.moments?.find((m) => m.kind === "booked");
    if (booked && params.From) {
      const caller = params.From;
      after(async () => {
        try {
          await sendSms({
            to: caller,
            from: to,
            body: afterCallText({
              day: booked.day,
              time: booked.time,
              person: booked.person,
              business: studio.name ?? "us",
              url: booked.url ?? "",
              held: booked.held || may.landsAs === "held",
            }),
          });
        } catch (e) {
          console.error("[voice/talk] could not text the booking:", (e as Error)?.message);
        }
      });
    }

    /*
     * And the links, by text, which is the medium they belong in.
     *
     * Sent as they come up rather than saved for the end of the call: a caller
     * who rings off mid-sentence has still had the thing they were promised,
     * and there is no end-of-call hook that fires reliably enough to trust
     * with it.
     *
     * Minus the booking page, when the text above is already carrying it. The
     * assistant usually does mention it in the turn where it books, so without
     * this the caller's phone buzzes twice within a second with the same link
     * — once bare, once with the appointment on it. The bare one is the one
     * worth losing. Anything else the reply offered still goes: a consent form
     * or a deposit link is a different errand.
     */
    const rest = booked?.url ? links.filter((l) => l !== booked.url) : links;

    if (rest.length && params.From) {
      /*
       * After the caller has heard the sentence, not before it.
       *
       * This used to be awaited, which put a text-message send on the critical
       * path of a spoken reply: the caller sat in silence for however long
       * Twilio's API took to accept the SMS, on the very turns that matter
       * most — the one where the booking page or the deposit link is being
       * promised. Giles, after the first real call: "there was a bit of lag."
       *
       * after() is what the SMS webhook already uses for the same reason. It
       * runs once the response has gone and keeps the function alive to
       * finish, rather than being killed mid-send the way a bare promise is.
       */
      const from = params.From;
      after(async () => {
        try {
          await textTheLinks({ to: from, from: to, links: rest });
        } catch (e) {
          console.error("[voice/talk] could not text the link:", (e as Error)?.message);
        }
      });
    }

    /*
     * Keep listening unless the assistant has plainly finished.
     *
     * Erring towards listening: a caller cut off mid-sentence has to ring
     * back and start again, where a listen that nobody fills ends politely on
     * its own after the Gather times out.
     */
    console.log(
      `[voice/talk] turn ${Date.now() - began}ms, of which the assistant ${thought}ms` +
        `, said ${reply.length} characters${rest.length ? `, ${rest.length} link(s) texting after` : ""}` +
        `${booked ? ", and the booking" : ""}`,
    );

    /*
     * And what this turn cost, written down after the caller has heard it.
     *
     * Every word spoken is billed by the character, and until now none of it
     * was counted anywhere — a Receptionist call never reached the calls table
     * at all, because that row is written by the missed-call webhook and a
     * line that picks up never goes down that path. So the dearest thing this
     * product does read as free.
     *
     * Per turn rather than per call: there is no end-of-call hook that fires
     * when somebody rings off mid-sentence, and a call that ends abruptly
     * still cost everything it spent up to that moment.
     */
    after(async () => {
      const studioId = connection?.studio_id as string | undefined;
      if (!studioId) return;

      await recordTurn(db, {
        callSid,
        studioId,
        from: params.From ?? null,
        to,
        spoke: reply.length,
        tier: tierOf(studio.receptionist_voice),
      });
    });

    return xml(sayAndListen(reply, `/api/voice/talk`, { voice: studio.receptionist_voice }));
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

/**
 * Texting the links a call could not say.
 *
 * Kept here rather than in the assistant because it is a fact about the
 * telephone: on every other channel the link is simply in the reply.
 */
async function textTheLinks(args: { to: string; from: string; links: string[] }) {
  const { sendSms } = await import("@/lib/messaging/sms");

  const body =
    args.links.length === 1
      ? `Here is the link we mentioned: ${args.links[0]}`
      : ["Here are the links we mentioned:", ...args.links].join(String.fromCharCode(10));

  await sendSms({ to: args.to, from: args.from, body });
}
