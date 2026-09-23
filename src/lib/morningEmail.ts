import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail, emailConfigured } from "./messaging/email";
import { alertAddress } from "./platformAlert";
import { newestBackup, lastAttempt, BUCKET } from "./backup";
import { smsConfigured } from "./messaging/sms";
import {
  morningReport,
  morningKey,
  londonDay,
  isMorning,
  type Check,
} from "./morningCheck";

/**
 * Everything checked, once a morning, whether or not anything is wrong.
 *
 * Giles asked for this after the backup stopped producing files for two nights
 * and nothing anywhere said so. Every check that existed had to be run by hand
 * from a laptop — which means it gets run when somebody already suspects
 * something, which is the one time monitoring is not needed.
 *
 * It rides on the sweep rather than having a schedule of its own, because a
 * second schedule is a second thing that can quietly stop. The sweep is the
 * one piece of scheduling already proven to be running, and if it stops, this
 * email stops arriving — which is itself the loudest possible signal.
 *
 * Never throws. A reporter that can fail the run it reports on is worse than
 * no reporter.
 */

/** Where the sweep's own heartbeats are kept. Not a backup, so never tidied. */
const RUNS_FILE = "sweep-runs.json";

/** Two days of heartbeats is enough to describe yesterday and no more. */
const KEEP_HOURS = 48;

/**
 * Writes down that the sweep ran, and says how it has been running.
 *
 * This is the question Giles asked directly: when are reminders actually
 * capable of going out. The answer is not the schedule — the workflow asks for
 * every five minutes and GitHub, which throttles scheduled runs hard, has been
 * giving it every two to five hours. Nothing in the product knew that, because
 * nothing recorded when it ran.
 *
 * A reminder can only go out on a sweep, so the gap between sweeps is the real
 * worst case for how late one can be. Recording each run is the only way to
 * state it rather than guess it.
 */
export async function noteRun(
  db: SupabaseClient,
  now: Date = new Date(),
): Promise<{ runs: number; longestGapMins: number | null }> {
  try {
    let times: string[] = [];
    const { data } = await db.storage.from(BUCKET).download(RUNS_FILE);
    if (data) {
      try {
        times = JSON.parse(await data.text()) as string[];
      } catch {
        /* A corrupted file is not worth failing over; start it again. */
        times = [];
      }
    }

    const cutoff = now.getTime() - KEEP_HOURS * 3_600_000;
    times = times.filter((t) => Date.parse(t) > cutoff);
    times.push(now.toISOString());
    times.sort();

    await db.storage
      .from(BUCKET)
      .upload(RUNS_FILE, Buffer.from(JSON.stringify(times), "utf8"), {
        contentType: "application/json",
        upsert: true,
      });

    /* Only the last day, because that is what the morning is reporting on. */
    const day = times.filter((t) => Date.parse(t) > now.getTime() - 24 * 3_600_000);
    let longest = null as number | null;
    for (let i = 1; i < day.length; i++) {
      const gap = Math.round((Date.parse(day[i]) - Date.parse(day[i - 1])) / 60_000);
      if (longest === null || gap > longest) longest = gap;
    }

    return { runs: day.length, longestGapMins: longest };
  } catch (e) {
    console.error("[morning] could not note the run:", (e as Error)?.message);
    return { runs: 0, longestGapMins: null };
  }
}

/** How old, in plain words. */
function ago(hours: number): string {
  if (hours < 36) return `${hours} hours old`;
  return `${Math.round(hours / 24)} days old`;
}

export async function sendMorningEmail(
  db: SupabaseClient,
  site: string,
  sweep: { runs: number; longestGapMins: number | null },
  now: Date = new Date(),
): Promise<{ sent: boolean; why?: string }> {
  try {
    if (!isMorning(now)) return { sent: false, why: "not yet morning" };

    const to = alertAddress();
    if (!to || !emailConfigured()) return { sent: false, why: "no address to send to" };

    const day = londonDay(now);

    /*
     * Claimed before it is composed, the way platform alerts claim their hour.
     * Two sweeps landing together would otherwise both send.
     */
    const { error: claimError } = await db
      .from("handled_messages")
      .insert({ message_id: morningKey(day), channel: "email" });

    if (claimError && claimError.code === "23505") return { sent: false, why: "already sent today" };
    if (claimError) {
      console.error("[morning] could not claim the day, sending anyway", claimError.message);
    }

    const checks: Check[] = [];

    /* ---------------------------------------------------------- the backup */
    const newest = await newestBackup(db);
    const attempt = await lastAttempt(db);

    if (!newest) {
      checks.push({ what: "Backup", ok: false, detail: "there is no backup at all" });
    } else if (newest.hoursOld > 36) {
      checks.push({
        what: "Backup",
        ok: false,
        detail:
          `the newest is ${newest.name}, ${ago(newest.hoursOld)}` +
          (attempt
            ? `. Last attempt ${attempt.at}: ${describeAttempt(attempt.outcome)}`
            : ". Nothing has recorded an attempt yet"),
      });
    } else {
      checks.push({
        what: "Backup",
        ok: true,
        detail: `${newest.name}, ${Math.round(newest.bytes / 1024)}KB, ${ago(newest.hoursOld)}`,
      });
    }

    /* ------------------------------------------------- how often it sweeps */
    /*
     * The sweep is what sends reminders, so its cadence is the worst case for
     * how late one can be. Above two hours is worth saying: the product tells
     * owners a held enquiry is picked up in about five minutes.
     */
    if (sweep.longestGapMins === null) {
      checks.push({ what: "Sweep", ok: true, detail: `${sweep.runs} run in the last day` });
    } else {
      const bad = sweep.longestGapMins > 120;
      checks.push({
        what: "Sweep",
        ok: !bad,
        warn: bad,
        detail:
          `${sweep.runs} runs in the last day, longest gap ${sweep.longestGapMins} minutes` +
          (bad ? " — reminders can be that late, and owners are told about five" : ""),
      });
    }

    /* ------------------------------------------------------- reminders sent */
    const dayAgo = new Date(now.getTime() - 24 * 3_600_000).toISOString();
    const { count: failed } = await db
      .from("reminders")
      .select("id", { count: "exact", head: true })
      .eq("status", "failed")
      .gte("due_at", dayAgo);

    checks.push(
      failed && failed > 0
        ? { what: "Reminders", ok: false, detail: `${failed} failed to send in the last day` }
        : { what: "Reminders", ok: true, detail: "none failed in the last day" },
    );

    const { count: stuck } = await db
      .from("reminders")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .lt("due_at", dayAgo);

    if (stuck && stuck > 0) {
      checks.push({
        what: "Waiting",
        ok: false,
        warn: true,
        detail: `${stuck} due over a day ago with nowhere to send them`,
      });
    }

    /* ------------------------------------------------------------ channels */
    checks.push(
      emailConfigured()
        ? { what: "Email", ok: true, detail: "configured" }
        : { what: "Email", ok: false, detail: "not configured, so nothing can be emailed" },
    );

    checks.push(
      smsConfigured()
        ? { what: "Texts", ok: true, detail: "configured" }
        : { what: "Texts", ok: false, detail: "not configured, so nothing can be texted" },
    );

    /* --------------------------------------------------------------- money */
    const stripeKey = process.env.STRIPE_SECRET_KEY ?? "";
    if (stripeKey.startsWith("sk_test")) {
      checks.push({
        what: "Stripe",
        ok: false,
        warn: true,
        detail: "still in test mode, so no real money can be taken",
      });
    } else if (stripeKey) {
      checks.push({ what: "Stripe", ok: true, detail: "live" });
    }

    /* ---------------------------------------------------------- businesses */
    const { count: live } = await db
      .from("studios")
      .select("id", { count: "exact", head: true })
      .is("archived_at", null);

    checks.push({ what: "Businesses", ok: true, detail: `${live ?? 0} running` });

    const report = morningReport(checks, day, site);

    const result = await sendEmail({
      to,
      subject: report.subject,
      text: report.text,
      automatic: true,
    });

    return { sent: result.status === "sent", why: result.error ?? undefined };
  } catch (e) {
    console.error("[morning]", (e as Error)?.message);
    return { sent: false, why: "could not send" };
  }
}

/** The last backup attempt, in a sentence. */
function describeAttempt(outcome: { ran: boolean; because?: string; error?: string }): string {
  if (outcome.ran) return "it worked";
  if (outcome.because === "failed") return `it failed — ${outcome.error ?? "no reason given"}`;
  return outcome.because ?? "no reason given";
}
