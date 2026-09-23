import type { SupabaseClient } from "@supabase/supabase-js";
import { hasColumn } from "@/lib/db/hasColumn";

/**
 * Writing down what a call was, so it can be costed.
 *
 * Called twice for the same call: once when the dial finishes, with how long
 * the owner's mobile rang, and again if a message was left, with how long it
 * ran. Twilio's own call id keys the row, so the second write updates the
 * first rather than inventing a second call — and a webhook Twilio retries
 * does not turn one call into three on the bill.
 *
 * Never fatal. A call whose meter we failed to write is a gap in a cost
 * figure; a call we dropped because the meter failed is a customer. Those are
 * not close, so every failure here is logged and swallowed.
 */
export async function writeCall(
  db: SupabaseClient,
  call: {
    studioId: string;
    callSid?: string | null;
    from?: string | null;
    to?: string | null;
    rangSeconds?: number;
    forwarded?: boolean;
    answered?: boolean;
    recordedSeconds?: number;
    transcribed?: boolean;
  },
): Promise<void> {
  /*
   * The table arrives with a migration, and until it is run this does nothing
   * at all — quietly, on purpose. Everything above it in the call path has to
   * keep working, and "the phone stopped answering because a cost table was
   * missing" is not a trade worth making.
   */
  if (!(await hasColumn(db, "calls", "call_sid"))) return;

  const row: Record<string, unknown> = {
    studio_id: call.studioId,
    call_sid: call.callSid ?? null,
    from_number: call.from ?? null,
    to_number: call.to ?? null,
    rang_seconds: call.rangSeconds ?? 0,
    forwarded: call.forwarded ?? false,
    answered: call.answered ?? false,
    recorded_seconds: call.recordedSeconds ?? 0,
    transcribed: call.transcribed ?? false,
  };

  /*
   * Whose number was rung, as it stood at the time.
   *
   * Derivable later by looking the number up against the connections, and
   * wrong the first time a number is handed from one stylist to another —
   * it would rewrite every call that person had ever taken. Whose it was at
   * the time is a fact about the call, so it is written on the call.
   *
   * Swallowed and guarded: a call that cannot be attributed is still a call
   * worth recording, and this must never be the reason one is lost.
   */
  try {
    if (call.to && (await hasColumn(db, "calls", "artist_id"))) {
      const { data: connection } = await db
        .from("channel_connections")
        .select("artist_id")
        .eq("studio_id", call.studioId)
        .eq("external_id", call.to)
        .maybeSingle();

      /* Null is the honest value for the business's own number. */
      row.artist_id = connection?.artist_id ?? null;
    }
  } catch {
    /* Unattributed rather than unrecorded. */
  }

  try {
    if (call.callSid) {
      /*
       * Merged on Twilio's id. The second write knows about the message and
       * nothing about the ring, so the fields it does not know are left off
       * rather than sent as zero — sending zero would wipe the ring seconds
       * the first write recorded.
       */
      const patch: Record<string, unknown> = { ...row };
      if (call.rangSeconds == null) {
        delete patch.rang_seconds;
        delete patch.forwarded;
        delete patch.answered;
      }
      if (call.recordedSeconds == null) {
        delete patch.recorded_seconds;
        delete patch.transcribed;
      }

      const { error } = await db.from("calls").upsert(patch, { onConflict: "call_sid" });
      if (error) console.error("[calls] could not write the call", error.message);
      return;
    }

    const { error } = await db.from("calls").insert(row);
    if (error) console.error("[calls] could not write the call", error.message);
  } catch (error) {
    console.error("[calls] could not write the call", (error as Error)?.message);
  }
}

/** Seconds off a Twilio form field, which arrives as a string or not at all. */
export function seconds(raw: string | undefined | null): number {
  const n = Number(String(raw ?? "").trim());
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}
