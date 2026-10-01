/*
 * Is the owner told when a customer writes, including after they take over?
 *
 *   sh scripts/pw/serve.sh && SITE=http://localhost:3130 node scripts/check-told-about-replies.cjs
 *
 * Giles, 1 October: "each time there is a return message by any means from a
 * customer the system notifies the user by email so they know to either take
 * over or respond if they have already taken over the conversation."
 *
 * Two things were wrong, and the second was the serious one.
 *
 *   1. A reply was notified at most once an hour per conversation. An hour is
 *      long enough to lose the message a business most wants: somebody answered
 *      at ten past who writes back at twenty past to say yes.
 *
 *   2. Once the owner took the conversation over, nothing notified at all.
 *      runTurn returned early, by design, so the assistant would stay out of
 *      it - and took the owner's only warning with it. The customer is then
 *      waiting on a person who has not been told they wrote.
 *
 * This drives the real widget endpoint on a demo and counts the claim rows in
 * handled_messages, which is what decides whether a notification goes.
 *
 * ── What it costs and what it touches ───────────────────────────────────────
 *
 * Three assistant turns on a demo, which is the only reason this is not run on
 * every push. The fourth message is free: a taken-over conversation returns
 * before the model is asked anything, which is the whole point of it.
 *
 * Demo businesses only, by slug, and their notification address is on Second
 * Pair's own domain rather than a client's. Every row written is deleted at the
 * end, including after a failure.
 */
const { SITE } = require("./pw/look.cjs");
const { createClient } = require("@supabase/supabase-js");
const { randomUUID } = require("crypto");

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

let faults = 0;
const ok = (w) => console.log(`  ok    ${w}`);
const bad = (w, d) => {
  faults++;
  console.log(`  FAULT ${w}${d ? ` — ${d}` : ""}`);
};
const note = (w) => console.log(`  --    ${w}`);

const mess = { conversationId: null, contactIds: [] };

async function tidyUp() {
  if (mess.conversationId) {
    await db.from("handled_messages").delete().like("message_id", `%${mess.conversationId}%`);
    await db.from("messages").delete().eq("conversation_id", mess.conversationId);
    await db.from("conversations").delete().eq("id", mess.conversationId);
  }
  if (mess.contactIds.length) await db.from("contacts").delete().in("id", mess.contactIds);
  console.log(`\n  tidied: ${mess.conversationId ? "1 conversation" : "nothing"}`);
}

/** The claim rows that decide whether an owner is told. */
async function claims(conversationId) {
  const { data } = await db
    .from("handled_messages")
    .select("message_id, seen_at")
    .like("message_id", `%${conversationId}%`)
    .order("seen_at");
  return data ?? [];
}

const repliedOnes = (rows) => rows.filter((r) => r.message_id.startsWith("replied:"));

async function say(slug, session, message) {
  const res = await fetch(`${SITE}/api/widget/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ studio: slug, session, message }),
  });
  const text = await res.text();
  return { status: res.status, text: text.slice(0, 160) };
}

(async () => {
  const { data: studio } = await db
    .from("studios")
    .select("id, name, slug, email")
    .eq("slug", "willow-demo")
    .is("archived_at", null)
    .maybeSingle();

  if (!studio) {
    note("willow-demo is not there");
    process.exit(0);
  }
  if (!/@second-pair\.com$/i.test(studio.email ?? "")) {
    note(`${studio.slug} notifies ${studio.email}, which is not ours, so nothing was sent`);
    process.exit(0);
  }

  console.log(`\n${studio.name} (${studio.slug}) · notifications go to ${studio.email}\n`);

  const session = `chk${randomUUID().replace(/-/g, "")}`.slice(0, 40);

  try {
    /* 1. A stranger gets in touch. One turn. */
    const first = await say(studio.slug, session, "Hello, do you do balayage on Saturdays?");
    if (first.status !== 200) {
      note(`the widget refused the first message (${first.status}): ${first.text}`);
      return;
    }

    const { data: convo } = await db
      .from("conversations")
      .select("id, contact_id, ai_paused")
      .eq("studio_id", studio.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!convo) {
      note("no conversation was created, so there is nothing to follow");
      return;
    }
    mess.conversationId = convo.id;
    if (convo.contact_id) mess.contactIds.push(convo.contact_id);

    const afterFirst = await claims(convo.id);
    if (afterFirst.some((r) => r.message_id.startsWith("gotintouch:"))) {
      ok("a first message tells the owner");
    } else {
      bad("a first message told nobody", afterFirst.map((r) => r.message_id).join(", ") || "no claims at all");
    }

    /* 2. They write again. A reply, and the first of its kind. One turn. */
    await say(studio.slug, session, "Sorry, I meant Saturday mornings specifically.");
    const afterSecond = repliedOnes(await claims(convo.id));
    if (afterSecond.length === 1) ok("writing again tells the owner, which an hourly throttle would have eaten");
    else bad(`writing again produced ${afterSecond.length} reply notifications`, "one was expected");

    /* 3. And again, straight away. This one is a burst and must be collapsed. */
    await say(studio.slug, session, "Any time before eleven is fine.");
    const afterThird = repliedOnes(await claims(convo.id));
    if (afterThird.length === 1) ok("a second message seconds later is counted as the same burst");
    else bad(`a burst produced ${afterThird.length} notifications`, "three messages in a row should be one email");

    /*
     * Which throttle is actually running, told from the shape of the claim.
     *
     * One email for three messages in a row is what the old hourly bucket did
     * too, so that test on its own cannot tell the two apart - and a check that
     * passes either way is worth nothing. The key says which: an hour bucket
     * ends in 2026-10-01T18 and a quiet-gap claim ends in a millisecond stamp.
     *
     * The difference it stands for is the one Giles asked about: under the hour,
     * a reply twenty minutes later was silently dropped.
     */
    const key = afterThird[0]?.message_id ?? "";
    const suffix = key.split(":").pop() ?? "";
    if (/^\d{10,}$/.test(suffix)) {
      ok("the throttle is a quiet gap, not an hour bucket");
    } else {
      bad(`the claim key ends in "${suffix}"`, "that is an hour bucket, so a reply 20 minutes later is lost");
    }

    /*
     * 4. The owner takes it over, and the customer writes again after a gap.
     *
     * The claims are cleared first, which is what a quiet two minutes looks
     * like without making the check wait two minutes for it. Only rows this
     * script caused are removed.
     */
    await db.from("handled_messages").delete().like("message_id", `%${convo.id}%`);
    await db.from("conversations").update({ ai_paused: true }).eq("id", convo.id);

    const before = await db
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", convo.id)
      .eq("role", "assistant");

    await say(studio.slug, session, "Hello? Are you still there?");

    const afterTakeover = repliedOnes(await claims(convo.id));
    if (afterTakeover.length === 1) {
      ok("a message on a conversation the owner has taken over tells the owner");
    } else {
      bad(
        `a taken-over conversation produced ${afterTakeover.length} notifications`,
        "this is the one nobody was being told about",
      );
    }

    /* And the assistant must still have stayed out of it. */
    const after = await db
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", convo.id)
      .eq("role", "assistant");

    if ((after.count ?? 0) === (before.count ?? 0)) {
      ok("and the assistant still said nothing, which is what taking over means");
    } else {
      bad("the assistant answered a conversation that had been taken over", "it must stay out");
    }
  } finally {
    await tidyUp();
  }

  console.log(faults ? `\n${faults} fault(s)\n` : "\nnothing wrong\n");
  process.exit(faults ? 1 : 0);
})().catch(async (e) => {
  console.error(e);
  await tidyUp();
  process.exit(1);
});
