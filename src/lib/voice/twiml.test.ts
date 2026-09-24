import { test } from "node:test";
import assert from "node:assert/strict";
import { escapeXml, twiml, hangUp, textsOnly, cannotTakeIt, ringThem, takeAMessage, sayAndListen, sayAndFinish } from "./twiml.ts";

/**
 * Every tag opened is closed, and nothing that goes in unbalances it.
 *
 * Not a real parser — a real parser is a dependency for four strings — but it
 * catches the fault that actually happens: a tag left open, or an apostrophe
 * in a business's name ending an attribute early. Twilio answers malformed
 * TwiML by dropping the call, which is silent at both ends.
 */
function wellFormed(xml: string): true {
  const body = xml.replace(/^<\?xml[^?]*\?>/, "");
  const stack: string[] = [];

  for (const tag of body.matchAll(/<(\/?)([A-Za-z]+)([^>]*?)(\/?)>/g)) {
    const [, closing, name, attrs, selfClosing] = tag;

    // Quotes inside attributes must be balanced, or one swallowed the next.
    const quotes = (attrs.match(/"/g) ?? []).length;
    assert.equal(quotes % 2, 0, `unbalanced quotes in <${name}${attrs}>`);

    if (selfClosing) continue;
    if (closing) {
      assert.equal(stack.pop(), name, `</${name}> closes nothing`);
    } else {
      stack.push(name);
    }
  }

  assert.deepEqual(stack, [], `left open: ${stack.join(", ")}`);
  return true;
}

test("a business with an apostrophe cannot break the answer", () => {
  const xml = textsOnly("Bob's & Sons <Plastering>");
  wellFormed(xml);
  assert.match(xml, /Bob&apos;s &amp; Sons &lt;Plastering&gt;/);
  assert.doesNotMatch(xml.replace(/&[a-z]+;/g, ""), /[<>]Plastering/);
});

test("every answer is a document Twilio can read", () => {
  for (const xml of [
    hangUp(),
    textsOnly(null),
    textsOnly("Cogs & Co"),
    cannotTakeIt("Willow & Co", "+447700900123"),
    ringThem("+447700900999", "+447700900123"),
    takeAMessage("Say what you need after the tone.", "+447700900123"),
  ]) {
    assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?><Response>/);
    assert.match(xml, /<\/Response>$/);
    wellFormed(xml);
  }
});

/*
 * The number is in a query string, and a plus sign in a query string means a
 * space. Left unencoded, Twilio calls us back about +447700900123 as
 * " 447700900123" and the callback cannot find the business.
 */
test("the number survives being put in an address", () => {
  assert.match(ringThem("+447700900999", "+447700900123"), /to=%2B447700900123/);
  assert.match(takeAMessage("hello there", "+447700900123"), /to=%2B447700900123/);
  assert.match(cannotTakeIt(null, "+447700900123"), /to=%2B447700900123/);
});

test("ringing them keeps the fifteen seconds and their own number", () => {
  const xml = ringThem("+447984810921", "+447576588065");
  assert.match(xml, /timeout="15"/, "longer and a mobile's voicemail answers first");
  assert.match(xml, /callerId="\+447576588065"/, "the business sees its own line calling");
  assert.match(xml, /<Number>\+447984810921<\/Number>/);
  assert.match(xml, /action="\/api\/voice\/missed/);
});

test("a message is recorded, capped, and sent to be read", () => {
  const xml = takeAMessage("Say what you need.", "+447700900123");
  assert.match(xml, /maxLength="90"/);
  assert.match(xml, /playBeep="true"/);
  assert.match(xml, /finishOnKey="#"/);
  assert.match(xml, /transcribe="true"/);
  assert.match(xml, /transcribeCallback="\/api\/voice\/said/);
});

test("escaping is only escaping", () => {
  assert.equal(escapeXml("plain words"), "plain words");
  assert.equal(escapeXml("a & b"), "a &amp; b");
  assert.equal(twiml("<Hangup/>"), '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>');
});

/* ────────────────────────── the Receptionist ────────────────────────────── */

test("it says something and listens for the answer", () => {
  const xml = sayAndListen("Hello, Willow and Co.", "/api/voice/talk?call=CA123");
  assert.match(xml, /<Gather input="speech" speechTimeout="auto" language="en-GB"/);
  assert.match(xml, /action="\/api\/voice\/talk\?call=CA123"/);
  assert.match(xml, /<Say voice="alice">Hello, Willow and Co\.<\/Say>/);
});

/*
 * A Gather that hears silence falls straight through to whatever comes next.
 * Without a line after it that is the end of the document, and the call ends
 * mid-conversation with no explanation.
 */
test("silence is answered rather than dropping the call", () => {
  const xml = sayAndListen("Anything else?", "/api/voice/talk");
  const afterGather = xml.slice(xml.indexOf("</Gather>"));
  assert.match(afterGather, /did not catch that/);
  assert.match(afterGather, /text you instead/);
});

test("a business with an apostrophe in its name does not break the document", () => {
  const xml = sayAndListen("Hello, Dave's Barbers & Sons.", "/api/voice/talk?a=1&b=2");
  assert.ok(!xml.includes("Dave's"), "the name was not escaped");
  assert.match(xml, /Dave&apos;s Barbers &amp; Sons/);
  assert.match(xml, /action="[^"]*a=1&amp;b=2"/);
});

/*
 * A Gather with nothing to gather keeps the line open for several seconds
 * while the caller waits for a machine that has finished.
 */
test("the last thing said ends the call", () => {
  const xml = sayAndFinish("You're booked in. Bye now.");
  assert.match(xml, /<Hangup \/>/);
  assert.ok(!xml.includes("<Gather"));
});
