"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireStudio } from "@/lib/studio";

export type NewClientState = { error?: string };

/** Erasing says only whether it refused; success leaves the page entirely. */
export type ForgetState = { error?: string };

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();

/**
 * Adding somebody who has never written in.
 *
 * Everybody else in here arrived through a conversation. This is for the
 * regular who books by walking in, and for the person you want to message
 * first — an offer of a cancelled slot has to have somebody to go to.
 *
 * A contact made this way has no channel, which is what the nullable column is
 * for. It also means the only way to reach them is a text message, and their
 * page says so plainly rather than pretending otherwise.
 */
export async function addClient(
  _prev: NewClientState,
  fd: FormData,
): Promise<NewClientState> {
  const { studio } = await requireStudio();
  const supabase = await createClient();

  const name = str(fd, "name");
  const phone = str(fd, "phone");
  const email = str(fd, "email");

  if (!name && !phone && !email) {
    return { error: "A name or a way of contacting them, at least." };
  }

  const { data, error } = await supabase
    .from("contacts")
    .insert({
      studio_id: studio.id,
      name: name || null,
      phone: phone || null,
      email: email || null,
      notes: str(fd, "notes") || null,
      alert: str(fd, "alert") || null,
      marketing_consent: fd.get("marketing_consent") === "on",
    })
    .select("id")
    .single();

  /*
   * They are already here.
   *
   * Adding somebody who exists is not a mistake worth a telling-off — it means
   * the person wanted this client and did not realise they had them. Take them
   * to the record instead of making them search for it.
   */
  if (error?.code === "23505") {
    // Only a number or an email can collide, so there is nothing to look up
    // without one. Belt and braces: an empty `or` filter is a query error.
    if (!phone && !email) return { error: "That client already exists." };

    const { data: existing } = await supabase
      .from("contacts")
      .select("id")
      .eq("studio_id", studio.id)
      .or([phone && `phone.eq.${phone}`, email && `email.eq.${email}`].filter(Boolean).join(","))
      .limit(1)
      .maybeSingle();

    if (existing) redirect(`/clients/${existing.id}?found=1`);
    return { error: "Somebody already has that number or email." };
  }

  if (error) return { error: error.message };

  revalidatePath("/clients");
  redirect(`/clients/${data.id}`);
}

/**
 * Erase a client, and everything that was ever said to them.
 *
 * Somebody can ask a business to delete them and the business has to be able
 * to do it — that is the law, not a preference, and until now there was no way
 * at all. A salon receiving that request had nothing to offer but an apology.
 *
 * Their appointments are kept and stripped rather than removed. A booking is
 * the business's own record of a day it worked: the diary would develop holes
 * where somebody used to be, last year's takings would quietly change, and a
 * person who was in the chair for three hours would have never existed. What
 * has to go is who they were, not that the afternoon happened.
 */
export async function forgetClient(_prev: ForgetState, fd: FormData): Promise<ForgetState> {
  const { studio } = await requireStudio();
  const supabase = await createClient();

  const id = String(fd.get("id") ?? "");
  const typed = String(fd.get("confirm") ?? "").trim();
  if (!id) return { error: "No client." };

  const { data: contact } = await supabase
    .from("contacts")
    .select("id, name")
    .eq("id", id)
    .eq("studio_id", studio.id)
    .maybeSingle();

  if (!contact) return { error: "That client is not here any more." };

  /*
   * Their name typed out, because this cannot be undone and a misclick in a
   * list is exactly how the wrong person gets erased.
   *
   * A client added from a diary entry may have no name at all, and comparing
   * against null would make them impossible to erase — the one outcome the law
   * does not allow. Those confirm with a word instead.
   */
  const mustType = contact.name?.trim() || "this client";
  if (typed !== mustType) {
    return { error: `Type ${mustType} exactly to erase them.` };
  }

  const { data: convs } = await supabase
    .from("conversations")
    .select("id")
    .eq("studio_id", studio.id)
    .eq("contact_id", id);

  const convIds = (convs ?? []).map((c) => c.id);

  if (convIds.length) {
    /*
     * Children first. Messages hold the actual conversation — the thing most
     * worth erasing — and enquiries hold what was asked for.
     */
    const { error: msgError } = await supabase
      .from("messages")
      .delete()
      .in("conversation_id", convIds);
    if (msgError) return { error: `Could not remove their messages: ${msgError.message}` };

    await supabase.from("enquiries").delete().in("conversation_id", convIds);
    await supabase.from("conversations").delete().in("id", convIds);
  }

  /*
   * The appointments stay, without a person attached.
   *
   * Anonymising rather than deleting: the diary keeps its shape, the accounts
   * still add up, and nothing personal is left on the row.
   */
  const { error: bookingError } = await supabase
    .from("bookings")
    .update({ contact_id: null, title: "Erased at their request", notes: null })
    .eq("contact_id", id);
  if (bookingError) return { error: `Could not clear their appointments: ${bookingError.message}` };

  const { error } = await supabase.from("contacts").delete().eq("id", id).eq("studio_id", studio.id);
  if (error) return { error: error.message };

  revalidatePath("/clients");
  redirect("/clients?erased=1");
}
