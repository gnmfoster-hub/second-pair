import type { SupabaseClient } from "@supabase/supabase-js";
import { monthOf } from "./billing.ts";
import { minutes as upToMinutes, SPOKEN_SECONDS } from "./voice/callCost.ts";
import { hasColumn } from "./db/hasColumn.ts";

/**
 * Writing down what a month has used so far.
 *
 * Run nightly, on the current month, overwriting the row each time. Two
 * reasons it is stored rather than counted when somebody looks:
 *
 * Data retention throws old conversations away, so a bill queried in February
 * cannot be rebuilt from January's messages — they do not exist any more. And
 * counting every message of every business on every page load is the sort of
 * screen that works beautifully with two businesses on it.
 *
 * The month is overwritten rather than added to, so a night that fails changes
 * nothing and the next one puts it right.
 */
export async function meterThisMonth(
  db: SupabaseClient,
  when: Date = new Date(),
): Promise<{ month: string; businesses: number; wrote: number; because?: string }> {
  const month = monthOf(when);
  const from = `${month}T00:00:00.000Z`;

  const { data: studios, error: studioError } = await db
    .from("studios")
    .select("id, plan_pence, texts_included, text_overage_pence, kind, archived_at");

  if (studioError) {
    // The plan columns arrive with a migration, and a deploy that lands before
    // it must not stop the rest of the nightly job.
    return { month, businesses: 0, wrote: 0, because: studioError.message };
  }

  const live = (studios ?? []).filter((s) => s.kind !== "demo" && !s.archived_at);
  let wrote = 0;

  for (const studio of live) {
    /*
     * Only the threads that have moved this month.
     *
     * This asked for every conversation a business has ever had, with no date
     * bound at all, and then paged their messages fifty threads at a time — so
     * a business with a thousand old threads cost twenty round trips a night
     * to count a month in which most of them said nothing, and the number grew
     * for ever.
     *
     * last_message_at moves whenever anybody sends, so a thread with nothing
     * this month cannot have anything to count.
     */
    const { data: convos, error: convoError } = await db
      .from("conversations")
      .select("id, channel, is_test")
      .eq("studio_id", studio.id)
      .gte("last_message_at", from);

    if (convoError) {
      console.error("[meter] could not read conversations", convoError.message);
      continue;
    }

    const real = (convos ?? []).filter((c) => !c.is_test);
    const channelOf = new Map(real.map((c) => [c.id, c.channel]));
    const ids = real.map((c) => c.id);

    let textsOut = 0;
    let textsIn = 0;
    let emailsOut = 0;
    let modelMicros = 0;

    /*
     * Every channel counted separately, whether or not anything charges for it
     * yet.
     *
     * The pricing model is not decided — it may end up split by channel, and
     * Meta bills per twenty-four-hour conversation rather than per message. All
     * of that can be priced later from history, but only if the history exists:
     * usage nobody recorded cannot be recovered afterwards. So this counts
     * everything now and decides nothing.
     *
     * "windows" is the count of conversation-days: one per thread per day that
     * anything was sent on it, which is the shape Meta and WhatsApp charge in.
     */
    /*
     * Windows are a Set here and a count in the stored shape: two messages on
     * the same day are one conversation-day, which is how Meta bills. The
     * telephone's minutes are plain numbers because each call is rounded on
     * its own before it gets here.
     */
    type Row = {
      out: number;
      in: number;
      windows: Set<string>;
      micros: number;
      calls?: number;
      connectedMinutes?: number;
      forwardedMinutes?: number;
      recordedMinutes?: number;
      transcribedMinutes?: number;
    };

    const byChannel = new Map<string, Row>();
    const channelRow = (name: string): Row => {
      const found = byChannel.get(name) ?? { out: 0, in: 0, windows: new Set<string>(), micros: 0 };
      byChannel.set(name, found);
      return found;
    };

    for (let i = 0; i < ids.length; i += 50) {
      const { data: msgs } = await db
        .from("messages")
        .select("conversation_id, role, usage, delivery, created_at")
        .in("conversation_id", ids.slice(i, i + 50))
        .gte("created_at", from);

      for (const m of msgs ?? []) {
        const channel = channelOf.get(m.conversation_id) ?? "web";
        const row = channelRow(channel);
        // What the model charged, attributed to the channel it was answering —
        // a WhatsApp conversation and a website one do not cost the same.
        const micros = (m.usage as { cost_micros?: number } | null)?.cost_micros ?? 0;
        modelMicros += micros;
        row.micros += micros;

        if (m.role === "client") {
          row.in++;
          row.windows.add(`${m.conversation_id}:${(m.created_at as string).slice(0, 10)}`);
          if (channel === "sms") textsIn++;
        } else if (m.role === "assistant" || m.role === "owner") {
          // A text that never left is not one we were charged for.
          if (m.delivery !== "failed") row.out++;
          row.windows.add(`${m.conversation_id}:${(m.created_at as string).slice(0, 10)}`);
          if (channel === "sms" && m.delivery !== "failed") textsOut++;
          if (channel === "email") emailsOut++;
        }
      }
    }

    /*
     * Through the booking, because a reminder does not know which business it
     * belongs to.
     *
     * This asked for reminders where studio_id matched — and `reminders` has
     * no such column. PostgREST refuses the whole statement, the error was
     * discarded by a bare destructure, and the loop below simply never ran. So
     * every reminder text and email was missing from the month's figures: for
     * a salon doing two hundred appointments that is most of their texts, and
     * the bill was quietly short by the biggest number on it.
     */
    const { data: reminders, error: reminderError } = await db
      .from("reminders")
      .select("channel, status, created_at, bookings!inner(artists!inner(studio_id))")
      .eq("bookings.artists.studio_id", studio.id)
      .gte("created_at", from);

    if (reminderError) {
      // Said out loud rather than swallowed. A month that cannot count its
      // reminders is a month nobody should be invoiced from.
      console.error("[meter] could not count reminders", reminderError.message);
    }

    for (const r of reminders ?? []) {
      if (r.status !== "sent") continue;
      if (r.channel) channelRow(r.channel as string).out++;
      if (r.channel === "sms") textsOut++;
      else if (r.channel === "email") emailsOut++;
    }

    /*
     * And the telephone, which is the only channel that bills by the minute.
     *
     * Four meters on one call: the leg in, the leg out to the owner's mobile,
     * the recording and the transcription. Rounded up per call rather than
     * per month, because that is how a carrier bills — a hundred fifteen-
     * second rings is a hundred minutes, not twenty-five, and rounding at the
     * end would understate the dearest channel by four times.
     *
     * Nothing until the migration adds the table. See writeCall.
     */
    if (await hasColumn(db, "calls", "call_sid")) {
      const { data: calls, error: callError } = await db
        .from("calls")
        .select("rang_seconds, forwarded, answered, recorded_seconds, transcribed")
        .eq("studio_id", studio.id)
        .gte("at", from);

      if (callError) {
        // Said out loud rather than swallowed: a month that cannot count its
        // calls is a month nobody should be invoiced from.
        console.error("[meter] could not count calls", callError.message);
      }

      if (calls?.length) {
        const row = channelRow("voice");
        row.calls = (row.calls ?? 0) + calls.length;

        for (const call of calls as {
          rang_seconds: number;
          forwarded: boolean;
          recorded_seconds: number;
          transcribed: boolean;
        }[]) {
          const rang = call.rang_seconds ?? 0;
          const recorded = call.recorded_seconds ?? 0;
          /* Every call that reached us was connected. See callCost. */
          row.connectedMinutes =
            (row.connectedMinutes ?? 0) + upToMinutes(rang + recorded + SPOKEN_SECONDS);
          if (call.forwarded) row.forwardedMinutes = (row.forwardedMinutes ?? 0) + upToMinutes(rang);
          row.recordedMinutes = (row.recordedMinutes ?? 0) + upToMinutes(recorded);
          if (call.transcribed) {
            row.transcribedMinutes = (row.transcribedMinutes ?? 0) + upToMinutes(recorded);
          }
        }
      }
    }

    /*
     * The per-channel column arrives with a migration, and until it is run the
     * whole upsert is rejected for naming a column that does not exist — so
     * the meter wrote nothing at all, every night, silently. Exactly the fault
     * the reviews kept turning up, introduced by the fix for one of them.
     */
    const perChannel = await hasColumn(db, "usage_months", "by_channel");

    const { error } = await db.from("usage_months").upsert(
      {
        studio_id: studio.id,
        month,
        texts_out: textsOut,
        texts_in: textsIn,
        emails_out: emailsOut,
        model_micros: modelMicros,
        ...(perChannel
          ? {
              by_channel: Object.fromEntries(
                [...byChannel].map(([name, row]) => [
                  name,
                  {
                    out: row.out,
                    in: row.in,
                    windows: row.windows.size,
                    micros: row.micros,
                    /* Left off entirely for every channel but the telephone. */
                    ...(row.calls
                      ? {
                          calls: row.calls,
                          connectedMinutes: row.connectedMinutes ?? 0,
                          forwardedMinutes: row.forwardedMinutes ?? 0,
                          recordedMinutes: row.recordedMinutes ?? 0,
                          transcribedMinutes: row.transcribedMinutes ?? 0,
                        }
                      : {}),
                  },
                ]),
              ),
            }
          : {}),
        /*
         * How it is priced, copied in as it stands tonight. A plan that
         * changes in March must not silently rewrite February's invoice.
         */
        plan_pence: studio.plan_pence ?? 0,
        texts_included: studio.texts_included ?? null,
        text_overage_pence: studio.text_overage_pence ?? 0,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "studio_id,month" },
    );

    if (error) console.error("[meter] could not write the month", error.message);
    else wrote++;
  }

  return { month, businesses: live.length, wrote };
}
