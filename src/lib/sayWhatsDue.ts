import type { SupabaseClient } from "@supabase/supabase-js";
import { reachOut } from "@/lib/messaging/reachOut";
import { verticalPack } from "@/lib/verticals";
import { dueSoon, type FactValues } from "@/lib/tradeFacts";
import { dueMessage, dueKey } from "@/lib/dueReminders";
import { hasColumn } from "@/lib/db/hasColumn";
import type { Studio } from "@/lib/types";

/**
 * The nightly look for anybody whose date is coming up.
 *
 * A garage's MOT, a driving pupil's theory pass, a tutor's exam. Runs from the
 * same job as the reminders and the review asks, and for the same reason: once
 * a day is the right frequency for something measured in weeks, and a job that
 * only matters occasionally is a job nobody notices has stopped.
 *
 * Almost every business skips this on the first line — only a handful of trades
 * define a fact with a reminder on it, and a business with none does no work
 * here at all.
 */
export async function sayWhatsDue(
  db: SupabaseClient,
  studio: Studio,
  now: Date = new Date(),
): Promise<{ sent: number; failed: number; skipped: number }> {
  const result = { sent: 0, failed: 0, skipped: 0 };

  const facts = verticalPack(studio.vertical).facts.filter((f) => f.remindBefore);
  if (!facts.length) return result;

  const off = (studio as unknown as { fact_reminders?: boolean | null }).fact_reminders === false;
  if (off) return result;

  /*
   * Nothing to read until the migration has run, and asking anyway would take
   * the whole nightly job down rather than this one part of it — PostgREST
   * refuses an entire query for one unknown column.
   */
  if (!(await hasColumn(db, "contacts", "trade_facts"))) return result;

  /*
   * Everybody, and the empty ones dropped here rather than in the query.
   *
   * Asking the database for "trade_facts is not {}" is a jsonb comparison I
   * cannot prove until the migration is run, and the way it fails is silent:
   * it matches nothing, sends nothing, and reports success every night. The
   * saving was never worth that — a business has hundreds of customers, not
   * hundreds of thousands, and this runs once a day.
   */
  const { data, error } = await db
    .from("contacts")
    .select("id, name, phone, email, trade_facts, marketing_sms, marketing_email")
    .eq("studio_id", studio.id)
    .limit(5000);

  if (error) throw new Error(`could not read customers: ${error.message}`);

  for (const person of (data ?? []) as {
    id: string;
    name: string | null;
    phone: string | null;
    email: string | null;
    trade_facts: FactValues | null;
    marketing_sms?: boolean | null;
    marketing_email?: boolean | null;
  }[]) {
    const values = person.trade_facts ?? {};
    if (!Object.keys(values).length) continue;

    for (const { fact, on } of dueSoon(facts, values, now)) {
      /*
       * Once per person per date, whatever happens next — claimed before the
       * send rather than after, so two instances of the job cannot both text
       * somebody about their MOT. The same table and unique index that stop a
       * webhook being handled twice. See dueKey for why the date is in it.
       */
      const { error: claimed } = await db
        .from("handled_messages")
        .insert({ message_id: dueKey(person.id, fact, on), channel: "sms" });
      if (claimed) {
        result.skipped++;
        continue;
      }

      /*
       * An explicit no is an explicit no.
       *
       * PECR's soft opt-in covers this — their own garage, about their own car,
       * with a way out in every message — but somebody who has actually
       * unticked both boxes has said more than the law assumes, and that beats
       * it. Checked before the send rather than per route, because refusing one
       * channel and falling through to the other is not honouring a refusal.
       */
      if (person.marketing_sms === false && person.marketing_email === false) {
        result.skipped++;
        continue;
      }

      const sent = await reachOut({
        db,
        studio,
        contact: person,
        body: dueMessage(fact, on, { name: person.name, business: studio.name }, now),
        subject: fact.label,
        /* Marketing, so STOP applies. deliver() enforces it; this is the call. */
        transactional: false,
      });

      if (sent.status === "sent" || sent.status === "delivered") result.sent++;
      else if (sent.status === "not_needed" || sent.status === "no_route") result.skipped++;
      else result.failed++;
    }
  }

  return result;
}
