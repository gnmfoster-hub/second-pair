/*
 * Has a booking confirmation ever actually reached anybody?
 *
 *   node scripts/check-confirmation.cjs
 *
 * The oldest thing on the worklist, sitting there since 22 September: "Every
 * part is checked and the whole is not. Add a confirmation on a demo, book
 * something, watch it arrive."
 *
 * It matters more since 29 September, because the confirmation is now the one
 * message this product offers a starter wording for. Handing somebody three
 * wordings for a message that never arrives would be worse than handing them an
 * empty box.
 *
 * ── Why this reads the real data instead of booking something ───────────────
 *
 * Two earlier versions of this tried to make one happen. The first inserted a
 * booking and imported the app's own scheduling code, which plain node cannot
 * load because lib here uses the @/ alias — and the failure arrived dressed up
 * as "nothing was written to send", which reads exactly like the product telling
 * nobody anything. The second drove the diary in a browser and could not fill
 * the client's name, because that box is inside a picker and has no name of its
 * own.
 *
 * Both were answering a smaller question than the one worth asking. "Can I make
 * one happen on a demo" is a rehearsal. "Has one ever reached a real customer"
 * is the thing Giles actually wants to know, it is answerable from rows that
 * already exist, and it costs nothing — no API turns, no test bookings in
 * anybody's diary, nothing to tidy up afterwards.
 *
 * So: read-only, every business, every confirmation ever written.
 */
require("./pw/look.cjs");
const { createClient } = require("@supabase/supabase-js");

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

let faults = 0;
const ok = (w) => console.log(`  ok    ${w}`);
const bad = (w, d) => {
  faults++;
  console.log(`  FAULT ${w}${d ? ` — ${d}` : ""}`);
};
const note = (w) => console.log(`  --    ${w}`);

(async () => {
  const { data: studios, error: se } = await db
    .from("studios")
    .select("id, name, slug, kind")
    .is("archived_at", null)
    .order("slug");
  if (se) {
    console.error(se.message);
    process.exit(1);
  }

  /*
   * A confirmation is a reminder template set to zero hours before. That is what
   * the database calls it and there is no separate table, which is deliberate —
   * see lib/reminders: it reuses the rendering, the channel choice, the opt-out,
   * the claim that stops it going twice and the record in the thread.
   */
  const { data: templates, error: te } = await db
    .from("reminder_templates")
    .select("id, studio_id, label, body, enabled, artist_id")
    .eq("hours_before", 0);
  if (te) {
    console.error(te.message);
    process.exit(1);
  }

  const byStudio = new Map();
  for (const t of templates ?? []) {
    const list = byStudio.get(t.studio_id);
    if (list) list.push(t);
    else byStudio.set(t.studio_id, [t]);
  }

  const confirmationIds = new Set((templates ?? []).map((t) => t.id));

  /*
   * Every reminder row ever written against one of those templates.
   *
   * Filtered in code rather than with .in() on a possibly-empty list, because an
   * empty .in() is a query that quietly matches nothing and would read as "no
   * confirmation has ever been sent" on a platform where none is set up. Those
   * are different findings and this has to be able to say which.
   */
  const { data: rows, error: re } = await db
    .from("reminders")
    .select("id, booking_id, template_id, status, due_at, sent_at, channel, body, error");
  if (re) {
    console.error(re.message);
    process.exit(1);
  }

  const sentRows = (rows ?? []).filter((r) => confirmationIds.has(r.template_id));

  console.log("");

  // ─────────────────────────────────────────── who has one set up at all
  const live = (studios ?? []).filter((s) => s.kind !== "demo");
  const withOne = [];
  const without = [];
  for (const s of studios ?? []) {
    const mine = (byStudio.get(s.id) ?? []).filter((t) => t.enabled && !t.artist_id);
    (mine.length ? withOne : without).push(s);
  }

  const liveWithout = without.filter((s) => s.kind !== "demo");
  if (liveWithout.length === 0) {
    ok(`every real business has a confirmation set up (${live.length} of them)`);
  } else {
    bad(
      `${liveWithout.length} of ${live.length} real businesses tell nobody their booking went through`,
      liveWithout.map((s) => s.slug).join(", "),
    );
  }
  note(`${withOne.length} of ${(studios ?? []).length} businesses have one, demos included`);

  // ──────────────────────────────────────────── has one ever gone out
  if (sentRows.length === 0) {
    bad(
      "no confirmation has ever been written for any booking, anywhere",
      confirmationIds.size === 0
        ? "and none is set up, so there is nothing to write"
        : "one is set up, so a booking should have written one",
    );
  } else {
    const sent = sentRows.filter((r) => r.sent_at);
    const pending = sentRows.filter((r) => !r.sent_at && r.status === "pending");
    const failed = sentRows.filter((r) => r.status === "failed");

    if (sent.length > 0) {
      ok(`${sent.length} confirmation${sent.length === 1 ? " has" : "s have"} actually gone out`);
    } else {
      bad(
        `${sentRows.length} written and not one sent`,
        "every piece works and the whole does not, which is the thing this check exists for",
      );
    }

    /*
     * Pending is the quiet failure. A confirmation goes at once rather than on
     * the daily sweep, because the whole point of it is arriving while the
     * customer still has their phone in their hand. One left pending means the
     * send-at-once did not happen, and the sweep will deliver it tomorrow — to
     * somebody who booked yesterday and has already wondered whether it worked.
     */
    if (pending.length > 0) {
      bad(
        `${pending.length} still waiting to go`,
        "a confirmation that waits for the daily sweep arrives long after it was any use",
      );
      for (const r of pending.slice(0, 3)) {
        note(`   waiting since ${String(r.due_at).slice(0, 16).replace("T", " ")}`);
      }
    } else {
      ok("none is sitting waiting for the daily sweep");
    }

    if (failed.length > 0) {
      /*
       * Failed is not automatically a fault. A walk-in with no phone number and
       * no email address is nowhere to send anything, and the product is right to
       * record that rather than pretend. What would be a fault is a failure with
       * a reason that is about us.
       */
      const nowhere = failed.filter((r) => /no (phone|email|address|way)/i.test(r.error ?? ""));
      const ours = failed.filter((r) => !nowhere.includes(r));
      note(`${failed.length} could not be sent`);
      for (const r of nowhere.slice(0, 3)) note(`   nowhere to send it: ${r.error}`);
      if (ours.length > 0) {
        bad(`${ours.length} failed for a reason that is ours`, ours[0].error ?? "no reason recorded");
      }
    }

    // ───────────────────────────────────── and does the wording read
    const newest = sent.sort((a, b) => String(b.sent_at).localeCompare(String(a.sent_at)))[0];
    if (newest?.body) {
      /*
       * A hole is a gap where a value should have gone, not any run of
       * whitespace.
       *
       * The first version of this used \s{2,}, which matches a blank line — so it
       * reported the most recent real confirmation as broken because it is an
       * email with paragraphs in it. Spaces and tabs only, and newlines left
       * alone, because a confirmation email is meant to have paragraphs and a
       * stripped placeholder leaves two spaces mid-sentence rather than a
       * paragraph break.
       */
      const holes = [
        [/\{\{/, "a placeholder nothing filled"],
        [/[ \t]{2,}/, "two spaces where something was taken out"],
        [/\s,/, "a space before a comma"],
        [/,\s*\./, "a comma running into a full stop"],
        [/\bwith\s*\.|\bwith$/, "with nobody"],
        [/\bat\s*\./, "at no time"],
      ].filter(([pattern]) => pattern.test(newest.body));

      if (holes.length) {
        bad(
          `the most recent one went out with ${holes[0][1]}`,
          JSON.stringify(newest.body.slice(0, 110)),
        );
      } else {
        ok(`the most recent one read: "${newest.body.split("\n")[0].slice(0, 80)}"`);
      }

      /*
       * And what it cost, while the row is here.
       *
       * The same character that was doubling the price of every reminder. A
       * confirmation is often an email, where it costs nothing — so this is a
       * note rather than a fault unless it actually went by text.
       */
      const odd = [...new Set([...newest.body].filter((c) => c.charCodeAt(0) > 127))];
      if (odd.length && newest.channel === "sms") {
        bad(
          `it went by text carrying ${odd.join(" ")}, so it was charged double`,
          "one character outside the basic alphabet takes a text from 160 to 70",
        );
      } else if (odd.length) {
        note(`   it carries ${odd.join(" ")}, which would cost double as a text (it went by ${newest.channel ?? "email"})`);
      }
    } else if (newest) {
      bad("a confirmation was sent with no words in it", `row ${newest.id}`);
    }

    /*
     * And the guard that stops two.
     *
     * The row is claimed on booking_id and template_id together, so a booking
     * moved three times still only ever confirms once. Two rows for one pair
     * would mean a customer told twice that the same appointment is booked,
     * which reads as a second appointment.
     */
    const pairs = new Map();
    for (const r of sentRows) {
      const key = `${r.booking_id}:${r.template_id}`;
      pairs.set(key, (pairs.get(key) ?? 0) + 1);
    }
    const doubled = [...pairs.entries()].filter(([, n]) => n > 1);
    if (doubled.length === 0) {
      ok("no booking has two confirmations against one wording");
    } else {
      bad(`${doubled.length} booking(s) have the same confirmation twice`, doubled[0][0]);
    }
  }

  console.log("");
  if (faults) {
    console.log(`${faults} fault${faults === 1 ? "" : "s"}.`);
    process.exitCode = 1;
  } else {
    console.log("Confirmations are set up, go out at once, and read properly.");
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
