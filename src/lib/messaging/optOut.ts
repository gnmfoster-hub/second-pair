import type { SupabaseClient } from "@supabase/supabase-js";
import { samePhone } from "../channels/phoneNumbers.ts";

/**
 * STOP, and START again.
 *
 * Only whole-message keywords. "Cancel" and "end" are left out on purpose: a
 * customer texting "cancel" almost always means their appointment, and
 * treating it as unsubscribing would silence the one conversation where
 * somebody needs an answer.
 */
const STOP = /^\s*(stop|stop all|stopall|unsubscribe|quit|opt out|optout)\s*[.!]*\s*$/i;
const START = /^\s*(start|unstop|opt in|optin)\s*[.!]*\s*$/i;

export function isStopWord(text: string | null | undefined): boolean {
  return STOP.test(String(text ?? ""));
}

export function isStartWord(text: string | null | undefined): boolean {
  return START.test(String(text ?? ""));
}

/** Remember a STOP. Never throws: a failure here must not become a reply. */
export async function recordOptOut(db: SupabaseClient, studioId: string, phone: string): Promise<void> {
  const number = samePhone(phone);
  if (!number) return;
  const { error } = await db
    .from("sms_opt_outs")
    .upsert({ studio_id: studioId, phone: number }, { onConflict: "studio_id,phone" });
  if (error) console.error("[sms] could not record opt-out", error.message);
}

export async function clearOptOut(db: SupabaseClient, studioId: string, phone: string): Promise<void> {
  const number = samePhone(phone);
  if (!number) return;
  await db.from("sms_opt_outs").delete().eq("studio_id", studioId).eq("phone", number);
}

/**
 * Whether this number has asked not to be texted by this business.
 *
 * A read that fails — the table not there yet, a blip — answers no, because
 * the alternative is no reminder going to anybody at all.
 */
export async function isOptedOut(
  db: Pick<SupabaseClient, "from">,
  studioId: string,
  phone: string | null | undefined,
): Promise<boolean> {
  const number = samePhone(phone);
  if (!number) return false;
  const { data, error } = await db
    .from("sms_opt_outs")
    .select("phone")
    .eq("studio_id", studioId)
    .eq("phone", number)
    .maybeSingle();
  return !error && Boolean(data);
}
