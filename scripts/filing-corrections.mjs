/*
 * Where the filtering got it wrong, according to the people who would know.
 *
 *   node scripts/filing-corrections.mjs
 *
 * Paperwork exists so a business can see what was decided for it and say when
 * that was wrong. That only helps if somebody reads the corrections, and until
 * now they went nowhere: a status changed in the picker leaves the database
 * tidier and tells me nothing.
 *
 * So this reads the two mistakes apart, because they want opposite fixes:
 *
 *   let through   the assistant answered it, and a person then marked it spam
 *                 or filed it. We treated junk as a customer — it cost a model
 *                 call, and on email it told a spammer the address is live.
 *
 *   filed wrongly  we filed it and a person moved it back out. That is the
 *                 expensive one: a customer we hid.
 *
 * Nothing here is automatic. It prints the real subjects and senders so a rule
 * can be written against what actually arrives rather than against what I
 * imagine arrives — every wrong guess in coldPitch so far has been mine.
 */
import { db } from "./_tidy.mjs";
import { judge } from "../src/lib/messaging/inboundEmail.ts";
import { coldPitch } from "../src/lib/messaging/coldPitch.ts";

const client = db();

const { data: studios, error: se } = await client
  .from("studios")
  .select("id, name, kind")
  .is("archived_at", null)
  .order("slug");

if (se) {
  console.log(`Could not read the businesses: ${se.message}`);
  process.exit(1);
}

/*
 * Our own note, written when something is filed.
 *
 * Filed only, never parked. The first version of this counted both, and
 * reported two of Neat & Tidy's real enquiries as customers we had hidden —
 * which was flatly untrue. Parking does not hide anything: it puts the
 * conversation in the inbox under "Need you" with the reason attached, which
 * is the opposite of hiding, and somebody then read both and marked them lost.
 * That is the product working, reported as a fault by a check that did not
 * know the difference between the two things it was looking at.
 */
const OURS = /^Filed as paperwork —/;

const letThrough = [];
const filedWrongly = [];

for (const studio of studios) {
  const { data: convs, error } = await client
    .from("conversations")
    .select("id, status, channel, external_ref, created_at")
    .eq("studio_id", studio.id)
    .eq("channel", "email")
    .eq("is_test", false);

  if (error) {
    console.log(`${studio.name}: could not read the inbox — ${error.message}`);
    continue;
  }

  for (const conv of convs ?? []) {
    const { data: msgs, error: me } = await client
      .from("messages")
      .select("role, content, created_at")
      .eq("conversation_id", conv.id)
      .order("created_at");

    // A refused read looks like an empty thread, and an empty thread looks
    // like nothing to report. Said out loud instead.
    if (me) {
      console.log(`  could not read ${conv.id.slice(0, 8)} — ${me.message}`);
      continue;
    }

    const all = msgs ?? [];
    const first = all.find((m) => m.role === "client");
    if (!first) continue;

    const subject = (first.content ?? "").split("\n\n")[0].replace(/\s+/g, " ").slice(0, 62);
    const answered = all.some((m) => m.role === "assistant");
    const weFiled = all.some((m) => m.role === "system" && OURS.test((m.content ?? "").trim()));

    /*
     * And the question that makes this worth reading: would it still get
     * through today?
     *
     * A list of things that went wrong last week is history. A list of things
     * that would go wrong again tomorrow is a job. Every one of these is put
     * back through the rules as they stand now, so the ones already fixed can
     * be said to be fixed and the rest can be written against.
     */
    const [subj, ...rest] = (first.content ?? "").split("\n\n");
    const body = rest.join("\n\n");
    const from = conv.external_ref ?? "";
    const stillGetsThrough =
      judge({ from, subject: subj, body }, {
        ownDomains: [],
        ourDomain: "second-pair.com",
        name: studio.name,
      }).what === "answer" && !coldPitch({ from, subject: subj, body }, { name: studio.name }).pitch;

    const where = {
      business: studio.name,
      live: studio.kind === "internal",
      from: conv.external_ref ?? "(no sender)",
      subject,
      status: conv.status,
      when: conv.created_at.slice(0, 10),
      stillGetsThrough,
    };

    // A person put it in the junk drawer after the assistant had answered it.
    if (!weFiled && answered && (conv.status === "spam" || conv.status === "paperwork")) {
      letThrough.push(where);
    }

    // We put it in the junk drawer and a person took it back out.
    if (weFiled && conv.status !== "spam" && conv.status !== "paperwork") {
      filedWrongly.push(where);
    }
  }
}

const show = (title, rows, note) => {
  console.log(`\n${title} — ${rows.length}`);
  if (!rows.length) {
    console.log("  none");
    return;
  }
  console.log(`  ${note}\n`);
  for (const r of rows) {
    console.log(
      `  ${r.when}  ${r.live ? "LIVE" : "demo"}  ${r.stillGetsThrough ? "STILL GETS THROUGH" : "caught now"}`,
    );
    console.log(`            ${r.from}`);
    console.log(`            ${r.subject}  → now ${r.status}`);
  }
};

show(
  "Answered, then filed by a person",
  letThrough,
  "We treated these as customers. Each one cost a reply, and on email a reply tells a spammer the address is live.",
);

show(
  "Filed by us, taken back out by a person",
  filedWrongly,
  "We hid these from the inbox and somebody disagreed. This is the expensive mistake.",
);

console.log(
  filedWrongly.length
    ? "\nStart with the second list: a customer we hid costs more than a spammer we answered."
    : letThrough.length
      ? "\nNothing we filed was disputed. The first list is what the rules still miss."
      : "\nNobody has corrected the filing yet.",
);
