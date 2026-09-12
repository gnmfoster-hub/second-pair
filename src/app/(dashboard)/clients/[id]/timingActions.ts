"use server";

import { revalidatePath } from "next/cache";
import { requireStudio } from "@/lib/studio";
import { createClient } from "@/lib/supabase/server";

export type TimingState = { error?: string; ok?: boolean };

/**
 * This client, this service, longer.
 *
 * Thick hair that always takes twenty minutes more. Somebody who cannot sit
 * still for a tattoo. Today that lives in one person's head and is lost the
 * day they are off, which is the whole reason the diary quietly runs late.
 *
 * Anybody in the business may write one, deliberately. It is learned by
 * whoever is stood behind the chair at the time, and that is the only useful
 * moment to record it — making it the owner's would mean a stylist telling the
 * owner, the owner never getting round to it, and the knowledge staying
 * exactly where it is now.
 */
export async function saveClientTiming(
  _prev: TimingState,
  fd: FormData,
): Promise<TimingState> {
  const { studio } = await requireStudio();
  const supabase = await createClient();

  const contactId = String(fd.get("contact_id") ?? "");
  const serviceId = String(fd.get("service_id") ?? "");
  if (!contactId || !serviceId) return { error: "Pick which service this is about." };

  /*
   * Both ends checked against this business before anything is written. The
   * policy on the table already reaches through the contact, so this is not
   * the only guard — but a service belonging to somebody else would otherwise
   * be refused by the database with a message nobody can act on.
   */
  const [{ data: contact }, { data: service }] = await Promise.all([
    supabase.from("contacts").select("id").eq("id", contactId).eq("studio_id", studio.id).maybeSingle(),
    supabase.from("services").select("id").eq("id", serviceId).eq("studio_id", studio.id).maybeSingle(),
  ]);

  if (!contact) return { error: "That client is not on this business." };
  if (!service) return { error: "That is not one of your services." };

  const raw = String(fd.get("minutes_delta") ?? "").trim();
  const delta = Number(raw);

  /*
   * Zero is the same as not having a row, and saying so is better than storing
   * one that does nothing: a client who once needed longer and no longer does
   * should come off the list rather than sit on it claiming nothing.
   */
  if (raw === "" || !Number.isFinite(delta) || Math.round(delta) === 0) {
    const { error } = await supabase
      .from("client_service_times")
      .delete()
      .eq("contact_id", contactId)
      .eq("service_id", serviceId);
    if (error) return { error: error.message };
    revalidatePath(`/clients/${contactId}`);
    return { ok: true };
  }

  /*
   * A guard against a typo that would wreck a day. Four hours either way is
   * far past anything a client's own timing means; somebody meaning to type
   * 20 and typing 200 should be stopped here rather than have the diary book
   * it.
   */
  if (Math.abs(delta) > 240) {
    return { error: "That is more than four hours. If it is really that different, it is a different service." };
  }

  const { error } = await supabase.from("client_service_times").upsert(
    {
      contact_id: contactId,
      service_id: serviceId,
      minutes_delta: Math.round(delta),
      // Off unless somebody says otherwise. A bill that grows on its own is
      // how trust goes, and whoever adds the time knows whether it is more
      // work or just more time.
      chargeable: fd.get("chargeable") === "on",
      note: String(fd.get("note") ?? "").trim() || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "contact_id,service_id" },
  );

  if (error) return { error: error.message };

  revalidatePath(`/clients/${contactId}`);
  return { ok: true };
}
