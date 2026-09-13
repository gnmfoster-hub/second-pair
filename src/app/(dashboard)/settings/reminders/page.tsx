import { createClient } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/studio";
import { ReminderEditor, type ReminderTemplateRow } from "./ReminderEditor";
import { SeedReminders } from "./SeedReminders";
import { verticalPack } from "@/lib/verticals";
import { smsNumberFor } from "@/lib/messaging/connections";
import { smsConfigured } from "@/lib/messaging/sms";
import { readableNumber } from "@/lib/channels/phoneNumbers";

export default async function RemindersPage() {
  // What customers are sent — the owner's, and the page says so
  // rather than only the tab: hiding a link is not a permission.
  const { studio } = await requireOwner();
  const supabase = await createClient();

  const { data } = await supabase
    .from("reminder_templates")
    .select("*")
    .eq("studio_id", studio.id)
    .order("hours_before", { ascending: false });

  const reminders = (data ?? []) as ReminderTemplateRow[];

  /*
   * Who these arrive from.
   *
   * The question every business asks about reminders, and the one this page
   * could not answer: a text at half past eight from a number nobody
   * recognises, telling somebody where to be tomorrow, gets ignored or
   * reported. The real answer is a good one — it comes from their own number,
   * the one on their van — and it was written down nowhere.
   */
  const number = await smsNumberFor(supabase, studio.id);
  const sender = {
    number: number ? readableNumber(number) : null,
    business: studio.name,
    ready: smsConfigured(),
  };

  return (
    <div className="space-y-3">
      <p className="hint">
        Sent before an appointment, in the same conversation the client started — so a reply
        comes back to you rather than disappearing into a no-reply inbox. What is worth
        saying differs by trade, which is why these start from your trade and are yours to
        rewrite.
      </p>

      {/*
        * Nothing set up means nobody is being reminded, which is worth saying
        * out loud rather than showing an empty page that looks finished.
        */}
      {reminders.length === 0 && (
        <SeedReminders trade={verticalPack(studio.vertical).label} />
      )}

      {reminders.map((reminder, i) => (
        <ReminderEditor key={reminder.id} reminder={reminder} index={i} sender={sender} />
      ))}

      <ReminderEditor index={reminders.length} sender={sender} />
    </div>
  );
}
