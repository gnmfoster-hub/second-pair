import type { SupabaseClient } from "@supabase/supabase-js";
import { monthOf } from "./billing.ts";

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
    const { data: convos } = await db
      .from("conversations")
      .select("id, channel, is_test")
      .eq("studio_id", studio.id);

    const real = (convos ?? []).filter((c) => !c.is_test);
    const channelOf = new Map(real.map((c) => [c.id, c.channel]));
    const ids = real.map((c) => c.id);

    let textsOut = 0;
    let textsIn = 0;
    let emailsOut = 0;
    let modelMicros = 0;

    for (let i = 0; i < ids.length; i += 50) {
      const { data: msgs } = await db
        .from("messages")
        .select("conversation_id, role, usage, delivery, created_at")
        .in("conversation_id", ids.slice(i, i + 50))
        .gte("created_at", from);

      for (const m of msgs ?? []) {
        const channel = channelOf.get(m.conversation_id) ?? "web";
        modelMicros += (m.usage as { cost_micros?: number } | null)?.cost_micros ?? 0;

        if (m.role === "client") {
          if (channel === "sms") textsIn++;
        } else if (m.role === "assistant" || m.role === "owner") {
          // A text that never left is not one we were charged for.
          if (channel === "sms" && m.delivery !== "failed") textsOut++;
          if (channel === "email") emailsOut++;
        }
      }
    }

    const { data: reminders } = await db
      .from("reminders")
      .select("channel, status")
      .eq("studio_id", studio.id)
      .gte("created_at", from);

    for (const r of reminders ?? []) {
      if (r.status !== "sent") continue;
      if (r.channel === "sms") textsOut++;
      else if (r.channel === "email") emailsOut++;
    }

    const { error } = await db.from("usage_months").upsert(
      {
        studio_id: studio.id,
        month,
        texts_out: textsOut,
        texts_in: textsIn,
        emails_out: emailsOut,
        model_micros: modelMicros,
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

    if (!error) wrote++;
  }

  return { month, businesses: live.length, wrote };
}
