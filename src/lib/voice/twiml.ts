/**
 * What we hand Twilio when a phone rings, written where it can be read.
 *
 * These were four strings built inline in two route files, and they are the
 * one part of this product nobody here can try: it needs a real call from a
 * real phone through a real carrier. An unclosed tag or a quote in a
 * business's name does not show up as an error anywhere — Twilio cannot parse
 * the answer, so the call simply drops, and the business loses an enquiry
 * without ever knowing there was one.
 *
 * So they live here, as functions, with tests. That does not prove a call
 * works. It proves the thing we say to Twilio is the thing we meant to say,
 * which is the half that can be checked without a telephone.
 */

/** Anything that goes inside a tag or an attribute has to survive being XML. */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** The document itself. Every answer below is wrapped in this. */
export function twiml(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`;
}

/** Nothing to say and nobody to say it to. */
export function hangUp(): string {
  return twiml("<Hangup/>");
}

/**
 * A number that takes texts and not calls.
 *
 * Said rather than hung up on, because a dead line reads as a broken business
 * and this one is a deliberate setting.
 */
export function textsOnly(business: string | null): string {
  return twiml(
    `<Say voice="alice">Thanks for calling${business ? " " + escapeXml(business) : ""}. ` +
      "This number takes text messages only. Send us a text and we will come straight " +
      "back to you.</Say><Hangup/>",
  );
}

/** Nobody to ring, so the caller is told and then texted. */
export function cannotTakeIt(business: string | null, to: string): string {
  return twiml(
    `<Say voice="alice">Thanks for calling${business ? " " + escapeXml(business) : ""}. ` +
      "We cannot take your call right now, so I will text you straight back.</Say>" +
      `<Redirect method="POST">/api/voice/missed?to=${encodeURIComponent(to)}</Redirect>`,
  );
}

/**
 * Ringing the owner's own phone first.
 *
 * Fifteen seconds, because the real competition is their voicemail: Twilio
 * cannot tell a person from an answerphone, so a mobile picking up its own
 * voicemail is reported as answered and no text is ever sent. A UK mobile's
 * voicemail usually starts between fifteen and twenty seconds.
 *
 * callerId is the number they dialled, so the business sees its own line
 * calling and knows to answer it as work.
 */
export function ringThem(forwardTo: string, to: string): string {
  return twiml(
    `<Dial timeout="15" callerId="${escapeXml(to)}" ` +
      `action="/api/voice/missed?to=${encodeURIComponent(to)}" method="POST">` +
      `<Number>${escapeXml(forwardTo)}</Number>` +
      "</Dial>",
  );
}

/**
 * Taking a message.
 *
 * Ninety seconds is long enough for somebody to describe a job and short
 * enough that a phone left in a pocket does not record the drive home. A beep
 * because people wait for one, and four seconds of silence ends it for anybody
 * who rang off.
 */
export function takeAMessage(said: string, to: string): string {
  return twiml(
    `<Say voice="alice">${escapeXml(said)}</Say>` +
      `<Record maxLength="90" timeout="4" finishOnKey="#" playBeep="true" ` +
      `transcribe="true" transcribeCallback="/api/voice/said?to=${encodeURIComponent(to)}" />` +
      `<Say voice="alice">Thanks, we will be in touch.</Say>`,
  );
}

/**
 * The Receptionist speaking, and listening for the answer.
 *
 * Giles chose the Twilio route over a realtime voice API: the audio stays on
 * the call we already have, the carrier does the speech-to-text and posts the
 * words to a webhook, and we answer with the next thing to say. Turn by turn
 * rather than continuous, about a second of lag, and — the part that decides
 * it — nothing about numbers, billing, the diary or dedupe changes. The other
 * route is more natural and takes the call off the path everything else uses.
 *
 * speechTimeout="auto" lets Twilio decide when somebody has stopped talking,
 * which is better than any number we could pick: a person saying "ten... no,
 * half ten" needs the pause and a person saying "yes" does not.
 *
 * The action URL carries the call's own id rather than a session of ours.
 * Twilio posts the same CallSid on every turn, so it is the one identifier
 * guaranteed to survive a conversation, and holding state under it means a
 * dropped call leaves nothing behind to clean up.
 */
export function sayAndListen(
  said: string,
  action: string,
  options: { hints?: string } = {},
): string {
  const hints = options.hints
    ? ` hints="${escapeXml(options.hints)}"`
    : "";

  return twiml(
    `<Gather input="speech" speechTimeout="auto" language="en-GB" action="${escapeXml(action)}" method="POST"${hints}>` +
      `<Say voice="alice">${escapeXml(said)}</Say>` +
      `</Gather>` +
      /*
       * What happens when somebody says nothing at all.
       *
       * A Gather that hears silence falls straight through to whatever comes
       * next, and without this that is the end of the document — the call
       * simply ends mid-conversation with no explanation. Somebody on a bad
       * line, or who put the phone down on the table, gets told what to do
       * instead of hearing it go dead.
       */
      `<Say voice="alice">Sorry, I did not catch that. I will text you instead so you can reply when you are ready.</Say>`,
  );
}

/**
 * The last thing said, with no question after it.
 *
 * Separate from sayAndListen because a Gather with nothing to gather keeps the
 * line open for several seconds while the caller waits for a machine that has
 * finished. Ending the call is part of answering it well.
 */
export function sayAndFinish(said: string): string {
  return twiml(`<Say voice="alice">${escapeXml(said)}</Say><Hangup />`);
}
