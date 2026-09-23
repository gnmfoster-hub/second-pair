"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { marketingPatch, canRecordEvidence, type MarketingChoice } from "@/lib/consent";
import { hasColumn } from "@/lib/db/hasColumn";

export type KeepState = { ok?: true; error?: string };

/**
 * A customer saying yes, on their own booking page.
 *
 * This is the half of marketing that was missing. The entitlement exists, the
 * rules exist, the screens exist — and across every business on the platform
 * nobody had opted in to anything, because there was nowhere to opt in from
 * except a preferences link at the foot of a message we were not yet sending.
 * A campaign tool built on that would have had a send button with nobody
 * behind it.
 *
 * The booking page is the right place to ask. They are already here, it is
 * already about them, and they arrived by tapping a link in a message from a
 * business they chose — which is a better moment than a checkbox buried in a
 * booking form nobody reads.
 *
 * Consent is theirs to give and theirs to take back. The same function the
 * preferences page uses records it, with the date and how it was given,
 * because under PECR a boolean is not consent — evidence is.
 */
export async function keepInTouch(_prev: KeepState, fd: FormData): Promise<KeepState> {
  const token = String(fd.get("token") ?? "");
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return { error: "That link does not work." };

  const db = createAdminClient();

  const { data: booking } = await db
    .from("bookings")
    .select("contact_id")
    .eq("public_token", token)
    .maybeSingle();

  if (!booking?.contact_id) return { error: "That link does not work." };

  const { data: contact } = await db
    .from("contacts")
    .select("*")
    .eq("id", booking.contact_id)
    .maybeSingle();

  if (!contact) return { error: "That link does not work." };

  /*
   * An address they have just given us, if they gave one.
   *
   * Sixteen of a hundred and forty-one people on the platform have an email
   * address, because most are typed into the diary by somebody on the phone
   * who did not ask for one. Saying yes to hearing from a business is exactly
   * the moment somebody is willing to hand one over, and without it the yes
   * cannot be acted on.
   */
  const typed = String(fd.get("email") ?? "").trim();
  const email = typed || (contact.email as string | null) || null;

  if (typed && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(typed)) {
    return { error: "That email address does not look right." };
  }

  /*
   * Only channels they can actually be reached on — the same rule the
   * preferences page applies, and for the same reason: a stored "text me"
   * against a record with no number reads later as a permission waiting for
   * whatever number gets added next.
   */
  const choice: MarketingChoice = {
    email: fd.get("by_email") === "on" && Boolean(email),
    sms: fd.get("by_sms") === "on" && Boolean(contact.phone),
  };

  const patch = marketingPatch(
    choice,
    contact,
    "they ticked it on their booking page",
    await canRecordEvidence(db).then((yes) => yes && hasColumn(db, "contacts", "marketing_email")),
  );

  const { error } = await db
    .from("contacts")
    .update({ ...patch, ...(typed ? { email: typed } : {}) })
    .eq("id", contact.id);

  if (error) return { error: "That did not save. Try again in a moment." };

  revalidatePath(`/b/${token}`);
  return { ok: true };
}
