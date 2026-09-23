import { createClient } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/studio";
import { ReminderEditor, type ReminderTemplateRow } from "./ReminderEditor";
import { SeedReminders } from "./SeedReminders";
import { verticalPack } from "@/lib/verticals";
import { smsNumberFor } from "@/lib/messaging/connections";
import { smsConfigured } from "@/lib/messaging/sms";
import { readableNumber } from "@/lib/channels/phoneNumbers";
import { reminderCover, whatIsMissing } from "@/lib/reminderCover";
import { avatarUrl } from "@/components/Avatar";
import { ChannelChoice } from "./ChannelChoice";
import { preferenceOf } from "@/lib/messageChannels";

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
   * Who this page is actually reminding, which it never used to say.
   *
   * A template belongs to the business or to one person, and this page listed
   * both the same way — so a salon with one stylist's own reminder and nothing
   * for the business looked set up, while five other stylists' clients were
   * sent nothing at all. Willow & Co was in that state and nothing on any
   * screen said so.
   *
   * select("*") because reminders_own arrived in a migration and a named
   * column PostgREST does not know refuses the whole query.
   */
  const { data: people, error: peopleFailed } = await supabase
    .from("artists")
    .select("*")
    .eq("studio_id", studio.id)
    .order("name");

  /*
   * A refused read returns no rows, which reads as a business with nobody in
   * it — and then nobody is uncovered, and this page goes quiet about the
   * exact thing it was built to say. Silence is the failure mode it exists to
   * prevent, so it must not be the failure mode it has.
   */
  if (peopleFailed) {
    console.error(`[reminders] could not read who works here: ${peopleFailed.message}`);
  }

  const cover = reminderCover(
    reminders,
    (people ?? []).map((p) => ({
      id: p.id as string,
      name: (p.name as string) ?? "",
      active: p.active !== false,
      ownReminders: (p as { reminders_own?: boolean }).reminders_own === true,
    })),
  );

  const missing = whatIsMissing(cover);

  /** Only the business's are the owner's to write from here. */
  const ours = reminders.filter((r) => !r.artist_id);

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

  /*
   * What the email will actually look like: their picture and their policy.
   * Null until the picture migration runs, which the template handles.
   */
  const look = {
    photoUrl: avatarUrl((studio as unknown as { photo_path?: string | null }).photo_path),
    policy: (studio as unknown as { cancellation_policy?: string | null }).cancellation_policy ?? null,
  };

  return (
    <div className="space-y-3">
      <p className="hint">
        Sent before an appointment, in the same conversation the client started, so a reply
        comes back to you rather than disappearing into a no-reply inbox. What is worth
        saying differs by trade, which is why these start from your trade and are yours to
        rewrite.
      </p>

      {/*
        * Who is not covered, said before anything else on the page.
        *
        * Not a decoration: a business can reach this screen, see a reminder
        * listed, and have nobody reminded at all — which is what "no reminder
        * for the business, one of Aisha's" looks like from here.
        */}
      {missing && (
        <p className="rounded-lg border border-warn/30 bg-warn/8 px-4 py-3 text-[13px] text-foreground">
          {missing}
        </p>
      )}

      {/*
        * Nothing set up means nobody is being reminded, which is worth saying
        * out loud rather than showing an empty page that looks finished — and
        * a page holding only somebody's own reminder looks exactly that way.
        */}
      {cover.businessWide === 0 && (
        <SeedReminders trade={verticalPack(studio.vertical).label} />
      )}

      {/*
        * How these go out, above the wording — it applies to all of them, and
        * to review requests and confirmations too.
        */}
      <ChannelChoice
        value={preferenceOf(
          (studio as unknown as { message_channels?: string | null }).message_channels,
        )}
        hasNumber={Boolean(sender.number)}
      />

      {ours.map((reminder, i) => (
        <ReminderEditor key={reminder.id} reminder={reminder} index={i} sender={sender} look={look} />
      ))}

      <ReminderEditor index={ours.length} sender={sender} look={look} />

      {/*
        * Other people's, named but not editable here.
        *
        * They used to be in the list above, indistinguishable from the
        * business's — and saving one from this page wrote it back to the
        * business, taking it off the person who wrote it. Whoever it belongs to
        * changes it in their own settings; the owner needs to know it exists,
        * not to be able to rewrite what goes out under somebody else's name.
        */}
      {cover.onTheirOwn.length > 0 && (
        <p className="hint">
          {cover.onTheirOwn.length === 1
            ? `${cover.onTheirOwn[0]} writes their own, and changes them in their own settings.`
            : `${cover.onTheirOwn.join(", ")} write their own, and change them in their own settings.`}
        </p>
      )}
    </div>
  );
}
