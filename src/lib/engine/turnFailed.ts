import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyStudio } from "@/lib/notify";

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
): Promise<void> {
  try {
    console.error(`[${args.channel}] turn failed`, (args.error as Error)?.message ?? args.error);

    const { data: conversation } = await db
      .from("conversations")
      .select("id")
      .eq("studio_id", args.studioId)
      .eq("channel", args.channel)
      .eq("external_ref", args.externalRef)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!conversation) return;

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
  } catch (e) {
    console.error("[turnFailed] could not hand over", (e as Error)?.message);
  }
}
