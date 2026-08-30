"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireStudio } from "@/lib/studio";

export type ClientState = { error?: string; ok?: boolean };

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();

export async function saveClient(_prev: ClientState, fd: FormData): Promise<ClientState> {
  const { studio } = await requireStudio();
  const supabase = await createClient();

  const id = str(fd, "id");
  const { error } = await supabase
    .from("contacts")
    .update({
      name: str(fd, "name") || null,
      phone: str(fd, "phone") || null,
      email: str(fd, "email") || null,
      notes: str(fd, "notes") || null,
      alert: str(fd, "alert") || null,
      marketing_consent: fd.get("marketing_consent") === "on",
    })
    .eq("id", id)
    .eq("studio_id", studio.id);

  if (error) {
    return {
      error:
        error.code === "23505"
          ? "Somebody else already has that number or email."
          : error.message,
    };
  }

  revalidatePath(`/clients/${id}`);
  revalidatePath("/clients");
  return { ok: true };
}
