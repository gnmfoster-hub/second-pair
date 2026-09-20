/*
 * Put the post that is already in the inbox where it now belongs.
 *
 *   node scripts/refile-paperwork.mjs            says what it would do
 *   node scripts/refile-paperwork.mjs --apply    does it
 *
 * Paperwork was added after these arrived, so a shop receipt is sitting in
 * Living Canvas's inbox marked Qualified — counted as a lead the studio
 * answered — and a listings site's daily figures are marked Spam, which is
 * wrong in the other direction: nobody was selling anything.
 *
 * Deliberately not my own opinion, one row at a time. It re-runs the same
 * judge() the webhook runs and moves only what that calls "file", so the
 * inbox ends up agreeing with the rule rather than with me. Anything it moves
 * can be moved back from the status picker, which is the whole point of the
 * category.
 *
 * Never touches a conversation with a booking, a price or a real customer's
 * words in it — those are checked before anything is written.
 */
import { db } from "./_tidy.mjs";
import { judge } from "../src/lib/messaging/inboundEmail.ts";

const apply = process.argv.includes("--apply");
const client = db();

const { data: studios, error: se } = await client
  .from("studios")
  .select("id, name, slug, email")
  .is("archived_at", null)
  .order("slug");

if (se) {
  console.log(`Could not read the businesses: ${se.message}`);
  process.exit(1);
}

let moved = 0;
let left = 0;

for (const studio of studios) {
  const { data: convs, error } = await client
    .from("conversations")
    .select("id, status, external_ref, contact_id")
    .eq("studio_id", studio.id)
    .eq("channel", "email");

  if (error) {
    console.log(`${studio.slug}: could not read the inbox — ${error.message}`);
    continue;
  }

  const mine = [];

  for (const conv of convs ?? []) {
    if (conv.status === "paperwork") continue;

    /*
     * Every message in the thread, not one of them.
     *
     * A thread here is keyed by the sender's address, so all of it came from
     * the same place — but not in the same shape. The classifieds site's daily
     * email arrived as a whole HTML document to begin with and as plain text
     * afterwards, once we started turning markup into words, and the shop's
     * receipts vary with what was ordered. Read the first and the advert stats
     * look like a marketing template; read the last and the shop receipt is
     * missed. Neither answer is about the thread.
     *
     * So: filed when any message in it is plainly the business's own post and
     * none of them reads like somebody getting in touch.
     */
    const { data: msgs, error: me } = await client
      .from("messages")
      .select("content")
      .eq("conversation_id", conv.id)
      .eq("role", "client")
      .order("created_at");

    // A refused read looks exactly like an empty conversation, and moving one
    // of those on no evidence is how a customer gets filed away.
    if (me) {
      console.log(`  could not read ${conv.id.slice(0, 8)} — ${me.message}`);
      continue;
    }

    if (!msgs?.length) continue;

    const business = {
      ownDomains: [studio.email ? studio.email.split("@")[1] : ""].filter(Boolean),
      ourDomain: "second-pair.com",
      name: studio.name,
    };

    const verdicts = msgs.map((m) => {
      const [subject, ...rest] = (m.content ?? "").split("\n\n");
      return {
        subject,
        verdict: judge({ from: conv.external_ref ?? "", subject, body: rest.join("\n\n") }, business),
      };
    });

    // One "answer" anywhere in it and it stays where it is: somebody wrote in.
    if (verdicts.some((v) => v.verdict.what === "answer")) continue;

    const post = verdicts.find((v) => v.verdict.what === "file");
    if (!post) continue;

    const subject = post.subject;
    const verdict = post.verdict;

    /*
     * Never over a booking.
     *
     * Filing hides a conversation from the inbox and from every figure. A
     * thread with an appointment against it is a customer whatever the words
     * look like — John was marked spam by a mis-tap with a deep clean booked,
     * two reminders sent, and vanished from the business he was booked with.
     */
    const { data: enq } = await client
      .from("enquiries")
      .select("id, quote_low_pence")
      .eq("conversation_id", conv.id);

    const ids = (enq ?? []).map((e) => e.id);
    const { count: bookings } = ids.length
      ? await client
          .from("bookings")
          .select("id", { count: "exact", head: true })
          .in("enquiry_id", ids)
          .is("cancelled_at", null)
      : { count: 0 };

    if (bookings) {
      console.log(`  kept: ${subject.slice(0, 50)} — it has an appointment against it`);
      left++;
      continue;
    }

    if ((enq ?? []).some((e) => e.quote_low_pence)) {
      console.log(`  kept: ${subject.slice(0, 50)} — somebody was quoted a price`);
      left++;
      continue;
    }

    mine.push({ id: conv.id, from: conv.status, subject, because: verdict.because });
  }

  if (!mine.length) continue;

  console.log(`\n${studio.name}`);
  for (const m of mine) {
    console.log(`  ${m.from.padEnd(10)} -> paperwork  ${m.subject.replace(/\s+/g, " ").slice(0, 52)}`);
    console.log(`             ${m.because}`);

    if (apply) {
      const { error: failed } = await client
        .from("conversations")
        .update({ status: "paperwork" })
        .eq("id", m.id);

      if (failed) {
        console.log(`             NOT MOVED — ${failed.message}`);
        continue;
      }

      await client.from("messages").insert({
        conversation_id: m.id,
        role: "system",
        content: `Filed as paperwork — ${m.because}. Move it back from the status picker if that is wrong.`,
      });
    }
    moved++;
  }
}

console.log(
  apply
    ? `\n${moved} filed as paperwork${left ? `, ${left} left alone` : ""}.`
    : `\n${moved} would be filed${left ? `, ${left} left alone` : ""}. Run again with --apply.`,
);
