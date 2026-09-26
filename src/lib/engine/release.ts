import type { SupabaseClient } from "@supabase/supabase-js";
import { runTurn } from "./run";
import { deliver, recordDelivery } from "@/lib/messaging/deliver";
import { smsNumberFor } from "@/lib/messaging/connections";
import { replyToFor } from "@/lib/messaging/replyTo";
import { notifyStudio } from "@/lib/notify";
import type { Channel } from "@/lib/types";

/**
 * Picking up the enquiries the owner did not get to.
 *
 * When the assistant stands back to give the owner first refusal, it writes a
 * time on the conversation and says nothing. This is the other half of that
 * bargain, and without it the feature is simply a way of never answering
 * anybody — so it matters more than the holding does.
 *
 * Two things stop it speaking over the owner. `ai_paused` is set the moment
 * they reply to a conversation, so a thread they have picked up is skipped
 * outright. And the hold is cleared as soon as it is claimed, so two overlapping
 * sweeps cannot both answer the same message.
 *
 * Unlike a website chat, nobody is watching a text message arrive, so the reply
 * has to be sent rather than returned. That is the whole reason a held reply
 * needs delivering here and a live one does not.
 */
export async function releaseHeldConversations(
  db: SupabaseClient,
  origin: string,
): Promise<{ answered: number; skipped: number; failed: number }> {
  const now = new Date().toISOString();

  /*
   * Only columns that exist, and the error read.
   *
   * This asked for a contact column that has never been in the database, so
   * PostgREST refused the whole query on every sweep — and the error was
   * discarded, so "nothing due" and "could not look" were the same answer.
   * Every text and email that arrived in opening hours was held for the owner
   * and then never answered by anybody, while every check said the job ran.
   */
  const { data: due, error } = await db
    .from("conversations")
    .select(
      "id, studio_id, external_ref, channel, ai_paused, last_message_at, studios(slug, name, email, archived_at), contacts(name, phone, email)",
    )
    /*
     * Paused ones are read too, and then cleared rather than answered.
     *
     * This used to filter them out in the query, which meant a conversation
     * the owner took over kept its hold for ever. Two things follow from that,
     * and the second is the one that matters.
     *
     * It sits in every "held past due" count as a permanent false alarm — the
     * Living Canvas text from 26 September was still showing 82 minutes late
     * an hour after Giles had answered it himself.
     *
     * And the hold is a loaded gun. Press "Hand back to the assistant" weeks
     * later and ai_paused goes false while hold_until is still in the past, so
     * the very next sweep has the assistant reply to a message from another
     * day as though it had just come in — to a customer who was answered by a
     * person at the time.
     *
     * Taking a conversation over voids the hold. That is what it means.
     */
    .lte("hold_until", now)
    .not("hold_until", "is", null)
    .limit(50);

  let answered = 0;
  let skipped = 0;
  let failed = 0;

  if (error) {
    console.error("[release] could not read held conversations", error.message);
    return { answered, skipped, failed: 1 };
  }

  for (const conversation of due ?? []) {
    // PostgREST returns a to-one embed as an object, not an array.
    const studio = conversation.studios as unknown as {
      slug: string;
      name: string;
      email: string | null;
      archived_at: string | null;
    } | null;
    const contact = conversation.contacts as unknown as {
      name: string | null;
      phone: string | null;
      email: string | null;
    } | null;

    /*
     * A stopped business answers nobody.
     *
     * This is the assistant replying on the owner's behalf to an enquiry they
     * did not pick up. Running it for a business that has been stopped would
     * have it speaking in their name, to their customer, after they stopped
     * being a customer of ours — the same fault as the widget and the
     * reminders, in the one place nobody is watching.
     */
    if (studio?.archived_at) continue;

    /*
     * The owner picked it up. The hold has done its job and is now void.
     *
     * Cleared rather than skipped every sweep, so it stops being counted as
     * late and cannot fire later if the assistant is handed the thread back.
     */
    if (conversation.ai_paused) {
      await db.from("conversations").update({ hold_until: null }).eq("id", conversation.id);
      skipped++;
      continue;
    }

    if (!studio || !conversation.external_ref) {
      // Nothing we can act on. Clear it rather than looking at it every sweep.
      await db.from("conversations").update({ hold_until: null }).eq("id", conversation.id);
      skipped++;
      continue;
    }

    /*
     * Claim it before answering, not after.
     *
     * Two sweeps can overlap — GitHub's scheduler is best-effort and a slow run
     * is still running when the next one starts. Clearing the hold first means
     * the second sweep does not see it, so a customer cannot get the same reply
     * twice. If the turn then fails, the conversation is left alone rather than
     * retried, which is the right way round: a missing reply is visible in the
     * inbox, a duplicate one is embarrassing and cannot be taken back.
     */
    const { data: claimed } = await db
      .from("conversations")
      .update({ hold_until: null })
      .eq("id", conversation.id)
      .not("hold_until", "is", null)
      .select("id");

    if (!claimed?.length) {
      skipped++;
      continue;
    }

    /*
     * Never answer what the mailbox already called spam.
     *
     * The inbound filter ignores these now, before a conversation exists. Mail
     * that arrived before it did was held like anything else, and this sweep
     * could not run at all at the time — so the first working run would have
     * been the assistant writing back to phishing. Checked here as well, so a
     * hold from before any future filter cannot do the same.
     */
    if (conversation.channel === "email") {
      const { data: said } = await db
        .from("messages")
        .select("content")
        .eq("conversation_id", conversation.id)
        .eq("role", "client")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (/^\s*(?:\*{2,}\s*spam\s*\*{2,}|\[spam\]|spam:)/i.test(said?.content ?? "")) {
        await db.from("conversations").update({ status: "lost" }).eq("id", conversation.id);
        skipped++;
        continue;
      }
    }

    try {
      const result = await runTurn({
        studioSlug: studio.slug,
        sessionKey: conversation.external_ref,
        channel: conversation.channel as Channel,
        // The customer's message is already recorded — this turn is only here
        // to answer it, so passing it again would say it twice.
        message: "",
        released: true,
        origin,
      });

      if (!result.reply) {
        skipped++;
        continue;
      }

      /*
       * The thread's own address first.
       *
       * A text or an email conversation is keyed on the number or address it
       * came from, and that is where the answer goes — the same place the
       * live reply is sent. The contact's saved details are usually empty on a
       * first message, which is exactly when a held reply is sent.
       */
      const to =
        conversation.channel === "sms"
          ? conversation.external_ref ?? contact?.phone
          : conversation.channel === "email"
            ? conversation.external_ref ?? contact?.email
            : conversation.external_ref;

      const delivery = await deliver({
        channel: conversation.channel as Channel,
        db,
        studioId: conversation.studio_id as string,
        to: to ?? null,
        /*
         * A cancelled slot offered to somebody who asked through the website
         * has to leave the website. They are not sitting in the widget waiting
         * — and this message is the whole point of the feature: a gap has
         * appeared and somebody wanted it.
         */
        reachOn: {
          phone: contact?.phone ?? null,
          email: contact?.email ?? null,
          // So an email opens with their name rather than "Hello,".
          firstName: (contact?.name ?? null) as string | null,
        },
        body: result.reply,
        lastInboundAt: conversation.last_message_at,
        subject: `Re: your enquiry`,
        fromName: studio.name,
        replyTo: replyToFor(studio),
        // From the number they texted, or a reply to it reaches no business.
        from:
          conversation.channel === "sms"
            ? await smsNumberFor(db, conversation.studio_id as string)
            : undefined,
      });

      const { data: message } = await db
        .from("messages")
        .select("id")
        .eq("conversation_id", conversation.id)
        .eq("role", "assistant")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (message) await recordDelivery(db, message.id, delivery);

      /*
       * Answered on the screen and not on their phone is not answered.
       *
       * The thread shows the reply either way, so without this a failed send
       * looks exactly like a sent one. Handed to the owner, and they are told.
       */
      if (delivery.status === "failed" || delivery.status === "outside_window") {
        await db
          .from("conversations")
          .update({ status: "needs_human" })
          .eq("id", conversation.id);
        await notifyStudio(db, conversation.studio_id as string, {
          title: "A reply did not go",
          body: "The assistant answered but it could not be sent. Reply to them yourself.",
          url: `/conversations/${conversation.id}`,
          tag: `undelivered-${conversation.id}`,
        });
        failed++;
        continue;
      }

      answered++;
    } catch (error) {
      // Logged rather than rethrown: one broken conversation must not stop the
      // sweep reaching the rest of them.
      console.error("[release]", conversation.id, error);
      failed++;
    }
  }

  return { answered, skipped, failed };
}
