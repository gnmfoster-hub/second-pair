import type { SupabaseClient } from "@supabase/supabase-js";
import { runTurn } from "./run";
import { deliver, recordDelivery } from "@/lib/messaging/deliver";
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

  const { data: due } = await db
    .from("conversations")
    .select(
      "id, external_ref, channel, ai_paused, last_message_at, studios(slug, name), contacts(phone, email, page_scoped_id)",
    )
    .lte("hold_until", now)
    .not("hold_until", "is", null)
    .eq("ai_paused", false)
    .limit(50);

  let answered = 0;
  let skipped = 0;
  let failed = 0;

  for (const conversation of due ?? []) {
    // PostgREST returns a to-one embed as an object, not an array.
    const studio = conversation.studios as unknown as { slug: string; name: string } | null;
    const contact = conversation.contacts as unknown as {
      phone: string | null;
      email: string | null;
      page_scoped_id: string | null;
    } | null;

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

      const to =
        conversation.channel === "sms"
          ? contact?.phone
          : conversation.channel === "email"
            ? contact?.email
            : (contact?.page_scoped_id ?? conversation.external_ref);

      const delivery = await deliver({
        channel: conversation.channel as Channel,
        to: to ?? null,
        /*
         * A cancelled slot offered to somebody who asked through the website
         * has to leave the website. They are not sitting in the widget waiting
         * — and this message is the whole point of the feature: a gap has
         * appeared and somebody wanted it.
         */
        reachOn: { phone: contact?.phone ?? null, email: contact?.email ?? null },
        body: result.reply,
        lastInboundAt: conversation.last_message_at,
        subject: `Re: your enquiry`,
        fromName: studio.name,
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
