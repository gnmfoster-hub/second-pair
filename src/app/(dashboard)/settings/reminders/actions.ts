"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireStudio } from "@/lib/studio";
import type { FormState } from "../actions";

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();

export async function saveReminder(_prev: FormState, fd: FormData): Promise<FormState> {
  const { studio } = await requireStudio();
  const supabase = await createClient();

  if (str(fd, "intent") === "delete") {
    const { error } = await supabase
      .from("reminder_templates")
      .delete()
      .eq("id", str(fd, "id"));
    if (error) return { error: error.message };
    revalidatePath("/settings/reminders");
    return { ok: true };
  }

  const body = str(fd, "body");
  if (!body) return { error: "Write what the reminder should say." };

  const hours = Number(str(fd, "hours_before"));
  if (!Number.isFinite(hours) || hours < 1 || hours > 720) {
    return { error: "Send it between 1 hour and 30 days before." };
  }

  const row = {
    studio_id: studio.id,
    label: str(fd, "label") || `${hours} hours before`,
    hours_before: hours,
    body,
    enabled: fd.get("enabled") !== "off",
    sort_order: Number(str(fd, "sort_order")) || 0,
  };

  const id = str(fd, "id");
  const { error } = id
    ? await supabase.from("reminder_templates").update(row).eq("id", id)
    : await supabase.from("reminder_templates").insert(row);

  if (error) {
    return {
      error:
        error.code === "23505"
          ? "There is already a reminder at that many hours before."
          : error.message,
    };
  }

  revalidatePath("/settings/reminders");
  return { ok: true };
}
