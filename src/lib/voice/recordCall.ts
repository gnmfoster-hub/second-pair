import type { SupabaseClient } from "@supabase/supabase-js";
import { hasColumn } from "@/lib/db/hasColumn";

/**
 * Writing down what a Receptionist call cost, turn by turn.
 *
 * The calls table was built for the answerphone and measures it exactly: the
 * leg in, the leg out to a mobile, the recording, the transcription. Four
 * clocks. A Receptionist call is not that shape, and — worse — never reached
 * the table at all, because the row is written by the missed-call webhook and
 * a line that picks up never goes down that path.
 *
 * So the most expensive thing this product does, and the thing being sold as a
 * priced add-on, appeared nowhere: not on the billing page, not in a report,
 * not in the monthly call cap it is meant to obey.
 *
 * Called once per turn rather than once per call, because there is no reliable
 * end-of-call hook — a caller who rings off mid-sentence fires nothing. Each
 * turn adds what it just spent, so a call that ends abruptly is still costed
 * for everything up to the moment it stopped.
 *
 * Nothing here may throw and nothing here may be awaited on the critical path.
 * A caller waiting in silence while we write a cost row is the exact mistake
 * this file is accounting for.
 */
export async function recordTurn(
  db: SupabaseClient,
  turn: {
    callSid: string;
    studioId: string;
    from: string | null;
    to: string;
    /** Characters actually said out loud this turn, after links were stripped. */
    spoke: number;
    tier: "generative" | "neural";
  },
): Promise<void> {
  try {
    /*
     * Guarded, because a deploy lands before its migration is run by hand and
     * PostgREST refuses an entire statement over one column it has not heard
     * of. Without this, the first Receptionist call after a deploy would fail
     * to write a row at all — and the failure would be in the half that is
     * supposed to be counting things.
     */
    if (!(await hasColumn(db, "calls", "spoken_characters"))) return;

    const { data: existing } = await db
      .from("calls")
      .select("id, spoken_characters, listened_seconds, at")
      .eq("call_sid", turn.callSid)
      .maybeSingle();

    if (!existing) {
      await db.from("calls").insert({
        studio_id: turn.studioId,
        call_sid: turn.callSid,
        from_number: turn.from,
        to_number: turn.to,
        /* A line that picks up never rings a mobile, so there is no leg out. */
        rang_seconds: 0,
        forwarded: false,
        answered: true,
        recorded_seconds: 0,
        transcribed: false,
        spoken_characters: turn.spoke,
        spoken_tier: turn.tier,
        listened_seconds: 0,
        answered_by: "receptionist",
      });
      return;
    }

    /*
     * How long the conversation has run, measured as the gap from the row's
     * own timestamp to now.
     *
     * Twilio never reports how long a Gather listened, so this is the whole
     * interval — our thinking, the voice playing, the caller speaking. That
     * makes it an upper bound on recognition and an honest figure for how long
     * the caller has been connected, which is a cost in its own right. Named
     * for what it is charged as rather than for what it perfectly measures,
     * and said so in the migration.
     */
    const ran = Math.max(0, Math.round((Date.now() - new Date(existing.at as string).getTime()) / 1000));

    await db
      .from("calls")
      .update({
        spoken_characters: ((existing.spoken_characters as number) ?? 0) + turn.spoke,
        spoken_tier: turn.tier,
        listened_seconds: ran,
      })
      .eq("id", existing.id);
  } catch (error) {
    /*
     * Counted or not, the call goes on. A cost row is worth having and never
     * worth dropping a caller over.
     */
    console.error("[voice/cost] could not record the turn:", (error as Error)?.message);
  }
}
