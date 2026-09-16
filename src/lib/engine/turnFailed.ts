import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyStudio } from "@/lib/notify";
import { alertPlatform } from "@/lib/platformAlert";

/**
 * The assistant fell over mid-reply. Somebody has to know.
 *
 * Both the text and the email routes caught a failed turn and returned
 * quietly — right about not sending an error to a customer, and wrong about
 * telling nobody. The customer had written, the thread showed their message,
 * nothing was sent, and the conversation sat in the inbox looking like any
 * other. Worse when the failure came after a booking was made: a real
 * appointment existed that the customer had never been told about.
 *
 * So the conversation is handed to the owner, a line on the thread says why,
 * and their phone is told. Never throws — this runs inside a catch.
 */
export async function handOverAfterFailure(
  db: SupabaseClient,
  args: { studioId: string; channel: string; externalRef: string; error: unknown },
): Promise<{ handed: boolean }> {
  try {
    const said = (args.error as Error)?.message ?? String(args.error ?? "");
    console.error(`[${args.channel}] turn failed`, said);

    /*
     * And us, once an hour, because a turn that fails here usually fails for
     * everybody. The business owner being told their own conversation needs
     * them is right and is not enough: when the cause is our account, ours is
     * the only inbox that can act on it.
     */
    /*
     * Awaited, not fired and forgotten.
     *
     * A bare `void` on a serverless function is a promise the platform may
     * freeze before it finishes — and this is the email that exists because
     * nobody knew the model account had run dry. The one alert in the product
     * that must actually leave the building was the one not waited for.
     */
    await alertPlatform(db, {
      name: "turn-failed",
      subject: "The assistant could not answer a customer",
      text:
        `A ${args.channel} conversation failed and was handed to the business.\n\n` +
        `What went wrong: ${said || "no message"}\n\n` +
        "One email an hour while it keeps happening. If this says anything about " +
        "credit, billing or a key, every business is affected until it is fixed.\n\n" +
        "node scripts/check-live.mjs says which part it is.",
    });

    const { data: conversation } = await db
      .from("conversations")
      .select("id")
      .eq("studio_id", args.studioId)
      .eq("channel", args.channel)
      .eq("external_ref", args.externalRef)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Nothing to hand over: said plainly, so a caller cannot promise a customer
    // that somebody has been told when nobody has.
    if (!conversation) return { handed: false };

    await db.from("conversations").update({ status: "needs_human" }).eq("id", conversation.id);
    await db.from("messages").insert({
      conversation_id: conversation.id,
      role: "system",
      content: "The assistant could not answer this one, so nothing was sent. Reply yourself.",
    });
    await notifyStudio(db, args.studioId, {
      title: "Needs you — the assistant could not answer",
      body: "Something went wrong writing a reply, so nothing was sent. Reply to them yourself.",
      url: `/conversations/${conversation.id}`,
      tag: `failed-${conversation.id}`,
    });
    return { handed: true };
  } catch (e) {
    console.error("[turnFailed] could not hand over", (e as Error)?.message);
    return { handed: false };
  }
}
