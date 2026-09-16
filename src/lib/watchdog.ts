import type { SupabaseClient } from "@supabase/supabase-js";
import { alertPlatform } from "@/lib/platformAlert";
import { emailReallyWorks } from "@/lib/messaging/email";
import { newestBackup, STALE_AFTER_HOURS } from "@/lib/backup";

/**
 * Whether the assistant can still answer, asked of the model rather than of
 * the environment.
 *
 * A key is not an answer. The account behind ours ran out of credit and every
 * check we had still said "connected", because every check we had looked at
 * whether a variable was set. One token settles it.
 */
export async function askTheModel(): Promise<{ answers: boolean; because: string | null }> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { answers: false, because: "ANTHROPIC_API_KEY is not set" };

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5-20250929",
        max_tokens: 1,
        messages: [{ role: "user", content: "hi" }],
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (response.ok) return { answers: true, because: null };

    const said = (await response.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null;
    return {
      answers: false,
      because: said?.error?.message?.slice(0, 300) ?? `the model answered ${response.status}`,
    };
  } catch (error) {
    return { answers: false, because: (error as Error)?.message?.slice(0, 200) ?? "no answer" };
  }
}

/**
 * The daily look, from the scheduled job.
 *
 * The first failing customer message raises the alarm on its own — see
 * platformAlert — but a quiet night is exactly when nobody writes in, and a
 * business waking up to a broken assistant should not be how we find out. So
 * the job that is running anyway asks the one question that matters.
 */
export async function watchTheEssentials(
  db: SupabaseClient,
): Promise<{ assistant: boolean; email: boolean; backups: boolean; told: boolean }> {
  const model = await askTheModel();
  // Asked of Resend, not of the environment. See emailReallyWorks.
  const email = await emailReallyWorks();
  /*
   * And whether anything is being backed up at all.
   *
   * The one fault here that costs everything and shows nothing: the product
   * works perfectly with no backups, right up until the morning something is
   * gone. It is a standing condition rather than an outage, so it says so once
   * a day and stops the moment a key is set.
   */
  /*
   * Asked of the bucket, not of the environment.
   *
   * "A key is set" was the question, and a key can be perfectly valid while
   * the write fails every night — wrong permissions, a full bucket, a renamed
   * table. Nothing anywhere had ever looked to see whether a file was there.
   */
  const newest = await newestBackup(db);
  const backups = newest !== null && newest.hoursOld <= STALE_AFTER_HOURS;

  if (model.answers && email && backups) {
    return { assistant: true, email, backups, told: false };
  }

  const wrong: string[] = [];
  if (!model.answers) wrong.push(`The assistant cannot answer: ${model.because}`);
  if (!email) wrong.push("Email will not send: the key is missing, refused, or the sending domain is not verified.");
  if (!backups) {
    wrong.push(
      newest
        ? `The newest backup is ${newest.name}, ${newest.hoursOld} hours old. Nothing has been ` +
          "written since, so the nightly job is failing."
        : "Nothing is being backed up — there is no file in the bucket at all. Either " +
          "BACKUP_KEY is not set in Vercel (or is shorter than 16 characters), or the nightly " +
          "write is failing.",
    );
  }

  const { sent } = await alertPlatform(db, {
    name: "watchdog",
    subject: "Second Pair: something is broken for every business",
    text:
      `${wrong.join("\n\n")}\n\n` +
      "Found by the nightly job, not by a customer. Every business is affected " +
      "until it is fixed.\n\nnode scripts/check-live.mjs says more.",
  });

  return { assistant: model.answers, email, backups, told: sent };
}
