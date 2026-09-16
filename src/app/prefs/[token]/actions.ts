"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { marketingPatch, canRecordEvidence, type MarketingChoice } from "@/lib/consent";
import { hasColumn } from "@/lib/db/hasColumn";

export type PrefsState = { ok?: boolean; error?: string; saved?: MarketingChoice };

/**
 * The customer setting their own preferences.
 *
 * No login: the long random token in the address is the credential, the same
 * way a form link or a calendar feed is. It can only ever reach the one record
 * it addresses, and it changes nothing except what that person hears about.
 *
 * Written with the server's own access because there is nobody signed in. What
 * it may write is two booleans and the evidence beside them — never a name, a
 * number, or anything that could be used to work out who they are.
 */
export async function setMyPreferences(_prev: PrefsState, fd: FormData): Promise<PrefsState> {
  const token = String(fd.get("token") ?? "");
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(token)) return { error: "That link does not work." };

  const db = createAdminClient();

  const { data: contact } = await db
    .from("contacts")
    .select("id, email, phone, marketing_consent, marketing_consent_at, marketing_email, marketing_sms")
    .eq("marketing_token", token)
    .maybeSingle();

  if (!contact) return { error: "That link does not work." };

  /*
   * Only channels they can actually be reached on.
   *
   * Otherwise a saved "text me" against a record with no number reads later as
   * a permission that cannot be acted on, which is the sort of thing that ends
   * up as a text to whatever number gets added next.
   */
  const choice: MarketingChoice = {
    email: fd.get("email") === "on" && Boolean(contact.email),
    sms: fd.get("sms") === "on" && Boolean(contact.phone),
  };

  const patch = marketingPatch(
    choice,
    contact,
    "they set it themselves",
    await canRecordEvidence(db).then((yes) => yes && hasColumn(db, "contacts", "marketing_email")),
  );

  const { error } = await db.from("contacts").update(patch).eq("id", contact.id);
  if (error) return { error: "That did not save. Try again in a moment." };

  return { ok: true, saved: choice };
}
