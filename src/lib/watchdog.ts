import type { SupabaseClient } from "@supabase/supabase-js";
import { alertPlatform } from "@/lib/platformAlert";
import { emailConfigured } from "@/lib/messaging/email";

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
): Promise<{ assistant: boolean; email: boolean; told: boolean }> {
  const model = await askTheModel();
  const email = emailConfigured();

  if (model.answers && email) return { assistant: true, email, told: false };

  const wrong: string[] = [];
  if (!model.answers) wrong.push(`The assistant cannot answer: ${model.because}`);
  if (!email) wrong.push("Email is not configured, so nothing can be sent or replied to.");

  const { sent } = await alertPlatform(db, {
    name: "watchdog",
    subject: "Second Pair: something is broken for every business",
    text:
      `${wrong.join("\n\n")}\n\n` +
      "Found by the nightly job, not by a customer. Every business is affected " +
      "until it is fixed.\n\nnode scripts/check-live.mjs says more.",
  });

  return { assistant: model.answers, email, told: sent };
}
