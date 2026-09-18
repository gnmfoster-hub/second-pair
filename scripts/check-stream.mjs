/*
 * Does the reply actually arrive in pieces, or all at once at the end?
 *
 *   node scripts/check-stream.mjs [business-slug]
 *
 * This is worth its own check because the way streaming fails is invisible.
 * A proxy that buffers the response hands over every piece correctly, in
 * order, with nothing missing — just all in the same millisecond, at the end.
 * The customer waits exactly as long as they did before and nothing anywhere
 * reports a fault. The only way to know is to time the first piece against
 * the last.
 *
 * So: the number that matters is how long until the first word appears, not
 * how long the whole thing took. Both are printed, and the check fails if
 * they are the same — which is what buffering looks like.
 *
 * Also confirms the plain path still works, because an old widget script
 * cached on a customer's website will keep using it for as long as their
 * browser holds onto it.
 */
const SITE = process.env.SITE ?? "https://www.second-pair.com";
const slug = process.argv[2] ?? "brightwork-demo";
const ask = "hi, roughly what would it cost to skim one ceiling?";

/*
 * Asking for compression, because a browser does.
 *
 * This check passed while the thing it checks was broken. Node does not ask
 * for compression by default and a browser always does, and the compressor at
 * the edge holds a whole body back to compress it — so the stream arrived
 * here in twenty-six pieces and arrived in Chrome as one, six seconds in.
 * Every word correct, in order, nothing missing, and the customer waiting
 * exactly as long as before.
 *
 * A check that tests a set of conditions no real customer is in is worse than
 * no check, because it is believed. So this asks the way Chrome asks.
 */
const post = (body) =>
  fetch(`${SITE}/api/widget/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept-Encoding": "gzip, deflate, br",
    },
    body: JSON.stringify(body),
  });

const session = () => "strm" + Math.random().toString(36).slice(2, 14) + "abcdefgh";
let faults = 0;

// ── streamed ────────────────────────────────────────────────────────────
{
  const began = Date.now();
  const r = await post({ studio: slug, session: session(), message: ask, stream: true });

  if (!r.ok || !r.body) {
    console.log(`  streamed: the request failed (${r.status})`);
    process.exit(1);
  }

  const type = r.headers.get("content-type") ?? "";
  if (!type.includes("ndjson")) {
    console.log(`  streamed: came back as ${type || "nothing"}, not ndjson`);
    faults++;
  }

  let first = null;
  let pieces = 0;
  let words = "";
  let done = null;
  let rest = "";

  const reader = r.body.getReader();
  const decode = new TextDecoder();
  for (;;) {
    const { value, done: finished } = await reader.read();
    if (finished) break;
    rest += decode.decode(value, { stream: true });
    const parts = rest.split("\n");
    rest = parts.pop() ?? "";
    for (const part of parts) {
      if (!part.trim()) continue;
      const event = JSON.parse(part);
      if (typeof event.t === "string") {
        first ??= Date.now() - began;
        pieces++;
        words += event.t;
      }
      if (event.done) done = event.done;
    }
  }

  const whole = Date.now() - began;
  console.log(`  first words after ${(first / 1000).toFixed(1)}s, all of it by ${(whole / 1000).toFixed(1)}s`);
  console.log(`  ${pieces} pieces, ${words.length} characters`);

  if (!done) {
    console.log("  no closing line — the widget would have had to ask again");
    faults++;
  } else if (done.reply !== words.trim() && !done.reply?.includes(words.trim().slice(0, 40))) {
    /*
     * The streamed words and the saved reply must be the same answer. They can
     * differ at the edges — the privacy line is added after the model has
     * finished — so the check is that the start of what was shown survives.
     */
    console.log("  what was shown is not what was saved");
    faults++;
  }

  /*
   * Buffered looks exactly like working, except for this.
   *
   * Half the total is generous; in practice the first words come in under two
   * seconds against a ten-second reply. Anything later than halfway means the
   * response was held somewhere and handed over in one go.
   */
  if (first === null) {
    console.log("  nothing streamed at all");
    faults++;
  } else if (first > whole * 0.5) {
    console.log(`  held back: the first words did not arrive until halfway through`);
    faults++;
  }
}

// ── the plain way, which old embedded scripts still use ─────────────────
{
  const began = Date.now();
  const r = await post({ studio: slug, session: session(), message: ask });
  const body = await r.json().catch(() => ({}));
  const took = ((Date.now() - began) / 1000).toFixed(1);

  if (!r.ok || !body.reply) {
    console.log(`  plain: no reply (${r.status}) — an old widget on a customer's site is broken`);
    faults++;
  } else {
    console.log(`  plain still answers, ${took}s, ${body.reply.length} characters`);
  }
}

console.log(faults ? `\n${faults} fault${faults > 1 ? "s" : ""}.` : "\nThe reply arrives as it is written.");
process.exit(faults ? 1 : 0);
