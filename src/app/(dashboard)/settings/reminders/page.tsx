import { createClient } from "@/lib/supabase/server";
import { requireStudio } from "@/lib/studio";
import { ReminderEditor, type ReminderTemplateRow } from "./ReminderEditor";

export default async function RemindersPage() {
  const { studio } = await requireStudio();
  const supabase = await createClient();

  const { data } = await supabase
    .from("reminder_templates")
    .select("*")
    .eq("studio_id", studio.id)
    .order("hours_before", { ascending: false });

  const reminders = (data ?? []) as ReminderTemplateRow[];

  return (
    <div className="space-y-3">
      <p className="hint">
        Sent before an appointment, in the same conversation the client started — so a reply
        comes back to you rather than disappearing into a no-reply inbox. What is worth
        saying differs by trade, which is why these start from your trade and are yours to
        rewrite.
      </p>

      {reminders.map((reminder, i) => (
        <ReminderEditor key={reminder.id} reminder={reminder} index={i} />
      ))}

      <ReminderEditor index={reminders.length} />
    </div>
  );
}
