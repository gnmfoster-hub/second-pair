"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireStudio } from "@/lib/studio";

export type NewClientState = { error?: string };

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
