import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendDueReminders } from "@/lib/reminders";
import { releaseExpiredHolds } from "@/lib/booking";
import { releaseHeldConversations } from "@/lib/engine/release";
import { nightlyBackup, newestBackup, recordAttempt, lastAttempt, type BackupOutcome } from "@/lib/backup";
import { siteOrigin } from "@/lib/origin";
import type { Studio } from "@/lib/types";
import { forgetOldEnquiries } from "@/lib/retention";
import { forgetHandledMessages } from "@/lib/handledMessages";
import { sweepWentWrong } from "@/lib/cronOutcome";
import { sendWeeklyReports } from "@/lib/weeklyReports";
import { watchTheEssentials } from "@/lib/watchdog";
import { askForReviews } from "@/lib/askForReviews";
import { sayWhatsDue } from "@/lib/sayWhatsDue";
import { meterThisMonth } from "@/lib/meter";
import { noteRun, sendMorningEmail } from "@/lib/morningEmail";
import { sendCampaigns } from "@/lib/sendCampaigns";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * The scheduled job: send what is due, release slots nobody paid for, and
 * answer the enquiries the owner did not get to.
 *
 * Protected by a shared secret rather than a session, because it is called by a
 * scheduler and not a person. Without the secret set it refuses outright — an
 * open endpoint that sends messages to a studio's clients is not something to
 * leave lying around.
 *
 * Called from two places, on purpose.
 *
 * vercel.json runs it once a day, which is all the Hobby plan allows and is not
 * a schedule for something that has to send a reminder at the right hour. The
 * real one is .github/workflows/reminders.yml, every five minutes, free. It was
 * fifteen until first refusal arrived: a five-minute head start released on a
 * fifteen-minute sweep is a twenty-minute wait, which is not what was promised
 * to either party.
 * Both is harmless: a reminder moves off `pending` the moment it is handled, so
 * it cannot be sent twice.
 *
 * vercel.json carries no note saying so because its schema rejects any key it
 * does not recognise — including a comment. Hence this.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  }

  const provided =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    request.nextUrl.searchParams.get("key");

  if (provided !== secret) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }

  const db = createAdminClient();

  // Frees slots held for a deposit that never arrived. Also done lazily when
  // availability is read, so this is a backstop for quiet diaries.
  const holds = await releaseExpiredHolds(db);
  const released = holds.released;

  /*
   * Message ids nothing will ask about again.
   *
   * They stop a webhook retry being answered twice, and Meta stops retrying
   * long before they expire. The table was created with a comment saying this
   * sweep clears it; until now nothing did, and it would have grown by a row
   * per message forever — slowly enough that the first sign would have come
   * long after anybody remembered why the table was there.
   */
  const tidied = await forgetHandledMessages(db);

  /*
   * And the note of what arrived, which is only worth a month.
   *
   * It exists to answer "is this address working" while a business is being
   * set up, and that question has an answer within days. Kept longer it
   * becomes a record of who has written to whom, slowly, for no reason anybody
   * would defend — so it is swept on the same run that clears everything else
   * nobody will ask about again.
   *
   * Swallowed: a sweep that cannot tidy is not a reason to fail a run that has
   * reminders to send.
   */
  try {
    const month = new Date(Date.now() - 30 * 86_400_000).toISOString();
    await db.from("inbound_emails").delete().lt("at", month);
  } catch {
    // The table arrives with a migration, and this must not wait for it.
  }

  /*
   * A sweep that cannot list the businesses has not run.
   *
   * The error was discarded, so a transient failure here made every loop below
   * iterate an empty list: no reminders, no released holds, no answers to mail
   * held overnight, no weekly reports — and the endpoint returned 200 with
   * "due 0, sent 0", which is exactly what a genuinely quiet night looks like.
   * The scheduler saw a green tick and the first sign of trouble was an empty
   * chair.
   */
  const { data: studios, error: studioError } = await db.from("studios").select("*");

  if (studioError) {
    console.error("[cron] could not list businesses", studioError.message);
    return NextResponse.json(
      { error: "could not list businesses", detail: studioError.message },
      { status: 500 },
    );
  }

  /*
   * Forgetting, on the same schedule as remembering.
   *
   * Only businesses that have chosen a period, and only enquiries that never
   * became a booking. Errors are collected rather than thrown: one business
   * whose sweep fails must not stop everybody else's reminders going out.
   */
  const forgotten = { conversations: 0, contacts: 0, failed: [] as string[] };
  for (const studio of studios ?? []) {
    if (!studio.keep_months || studio.archived_at) continue;
    const swept = await forgetOldEnquiries(db, studio);
    if (swept.error) forgotten.failed.push(`${studio.slug}: ${swept.error}`);
    forgotten.conversations += swept.conversations;
    forgotten.contacts += swept.contacts;
  }

  let due = 0;
  let sent = 0;
  let waiting = 0;
  const failures: string[] = [];

  for (const studio of (studios ?? []) as Studio[]) {
    /*
     * A stopped business does not message anybody.
     *
     * Stopping silences the assistant on the website, and this ran on
     * regardless — so the night after a business was stopped, texts and emails
     * would still go out to its customers, in its name, from a company that is
     * no longer its supplier. Worse than the widget answering, because nobody
     * asked for these and there is nothing on screen to explain them.
     *
     * The appointments themselves are untouched. If the business comes back
     * next week, so do the reminders.
     */
    if (studio.archived_at) continue;

    try {
      const result = await sendDueReminders(db, studio);
      due += result.due;
      sent += result.sent;
      waiting += result.waiting.length;
      if (result.failed) failures.push(`${studio.name}: ${result.failed} failed`);
    } catch (error) {
      failures.push(`${studio.name}: ${(error as Error).message}`);
    }
  }

  /*
   * The enquiries the owner was given first refusal on and did not answer.
   *
   * Last, and deliberately not inside the try above: a reminder that fails to
   * send must not stop somebody's customer getting a reply, which is the more
   * urgent of the two by a distance.
   */
  const answered = await releaseHeldConversations(db, await siteOrigin());

  /*
   * Monday's report, for the businesses that asked for it. After everything
   * a customer is waiting on, and never able to fail the run.
   */
  const weekly = await sendWeeklyReports(db, (studios ?? []) as Studio[], await siteOrigin()).catch((e) => ({
    sent: 0,
    failed: [(e as Error).message],
  }));

  /*
   * Tonight's copy of the book.
   *
   * Last, because it is the one thing here nobody is waiting on, and quiet:
   * it takes one a day and says so, and without a key it does nothing at all
   * rather than pretending. The early hours because that is when the diary is
   * least likely to be written to mid-copy.
   */
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Europe/London" })
      .format(new Date()),
  );
  /*
   * "No key" beats "not the hour", and that ordering is the whole point.
   *
   * It was the other way round, so at any hour but three in the morning the
   * job reported "not the hour" and stopped — and the check read that as
   * "backups are running" and passed. Every look at it said everything was
   * fine while the bucket was empty and nothing could ever be written to it.
   * A guard that answers all clear without looking is worse than no guard,
   * because it is believed.
   */
  /*
   * And no upper bound on the hour, which is why there has been no backup
   * since the 21st.
   *
   * This asked for a sweep landing between two and five in the morning. Both
   * things that call this endpoint fail that test most nights:
   *
   *   GitHub's every-five-minutes schedule is throttled, and not gently.
   *   sweep-runs.json holds every run of the last 48 hours and held five, from
   *   06:45 to 20:15 — gaps of five and seven and a half hours. A three-hour
   *   window is missed more often than it is hit, and on the nights it was
   *   missed nothing was written and nothing said why.
   *
   *   Vercel's own daily cron is the one call a day that does reliably happen,
   *   and it runs at seven, so the window excluded the only dependable caller
   *   we have.
   *
   * nightlyBackup already refuses a second copy on a day that has one, so the
   * window was never what stopped it running twice — it only chose the hour.
   * From two in the morning onwards, then: a sweep at three still takes it at
   * three, and if nothing lands until the morning it is taken in the morning
   * rather than not at all.
   *
   * The early hours were chosen because the diary is least likely to be
   * written to mid-copy. That is a real reason and it is worth less than a
   * backup existing: a copy taken at eight with one appointment saved halfway
   * through beats three days with no copy at all.
   */
  const key = process.env.BACKUP_KEY ?? "";
  const backup =
    key.length < 16
      ? { ran: false as const, because: "no key" as const }
      : hour >= 2
        ? await nightlyBackup(db)
        : { ran: false as const, because: "not the hour" as const };

  /*
   * Whatever it said, written down where it can be read tomorrow.
   *
   * Only when something was actually attempted. "Not the hour" is the answer
   * on almost every call of the day and recording it would overwrite the one
   * answer worth keeping with noise.
   */
  if (backup.ran || backup.because !== "not the hour") {
    await recordAttempt(db, backup as BackupOutcome, new Date());
  }

  /*
   * That the sweep ran at all, and then the morning email.
   *
   * The heartbeat first, so the gap it reports includes this run. Both ride on
   * this job rather than having schedules of their own: a second schedule is a
   * second thing that can quietly stop, and if this one stops the email stops
   * arriving — which is the loudest signal there is.
   *
   * Neither can fail the sweep. Somebody's reminder is more important than
   * being told about it.
   */
  /*
   * Campaigns, last of the sending and never able to fail the run.
   *
   * Somebody's reminder is worth more than somebody's offer, and an offer that
   * misses a day is worth nothing beside a reminder that does. sendCampaigns
   * swallows its own failures for the same reason.
   */
  const campaigns = { sent: 0, skipped: 0, failed: 0 };
  for (const studio of (studios ?? []) as Studio[]) {
    if (studio.archived_at) continue;
    const out = await sendCampaigns(db, studio, await siteOrigin(), new Date());
    campaigns.sent += out.sent;
    campaigns.skipped += out.skipped;
    campaigns.failed += out.failed;
  }

  const sweepRuns = await noteRun(db, new Date());
  const morning = await sendMorningEmail(db, await siteOrigin(), sweepRuns, new Date());

  /*
   * And whether any of this could have worked at all.
   *
   * Asked last, so a broken model cannot stop the reminders going out — they
   * do not need it. See watchdog: it emails us, once, and only when something
   * is wrong for every business rather than for one conversation.
   */
  /*
   * Yesterday's appointments, asked about once — for the businesses that have
   * switched it on and given us a link. See askForReviews: the morning after,
   * never minutes after, and never to somebody who has said stop.
   */
  const reviews = { asked: 0, failed: 0, skipped: 0 };
  for (const studio of (studios ?? []) as Studio[]) {
    if (studio.archived_at) continue;
    try {
      const one = await askForReviews(db, studio);
      reviews.asked += one.asked;
      reviews.failed += one.failed;
      reviews.skipped += one.skipped;
    } catch (e) {
      reviews.failed++;
      failures.push(`asking for reviews at ${studio.slug}: ${(e as Error)?.message ?? e}`);
    }
  }

  /*
   * And anybody whose MOT, theory pass or exam is coming up.
   *
   * After the reminders, because an appointment tomorrow matters more than a
   * date in six weeks, and a failure here must not stop those going out. Almost
   * every business does no work at all: only a handful of trades define a fact
   * with a reminder on it. See sayWhatsDue.
   */
  const dues = { sent: 0, failed: 0, skipped: 0 };
  for (const studio of (studios ?? []) as Studio[]) {
    if (studio.archived_at) continue;
    try {
      const one = await sayWhatsDue(db, studio);
      dues.sent += one.sent;
      dues.failed += one.failed;
      dues.skipped += one.skipped;
    } catch (e) {
      dues.failed++;
      failures.push(`saying what is due at ${studio.slug}: ${(e as Error)?.message ?? e}`);
    }
  }

  const working = await watchTheEssentials(db);

  /*
   * And what the month has used, written down.
   *
   * Nightly rather than at month end: a job that only matters once a month is
   * a job nobody notices has been failing. See meter.ts for why it is stored
   * at all rather than counted when somebody looks.
   */
  const metered = await meterThisMonth(db);

  /*
   * And what is genuinely in the bucket, so the check outside can say the date
   * of the newest file rather than repeating what the job intended to do.
   */
  const newest = await newestBackup(db);

  const body = {
    released, due, sent, waiting, failures, answered, forgotten, tidied, weekly,
    reviews,
    dues,
    backup: { ...backup, newest, lastAttempt: await lastAttempt(db) },
    campaigns,
    sweep: sweepRuns,
    morning,
    working,
    metered,
  };

  /*
   * Said out loud, because nothing downstream will say it.
   *
   * Everything above happens whatever the status — the work is done by the
   * time we get here, and this only decides how it is reported. It reported
   * 200 regardless, and the workflow that calls this every five minutes fails
   * only on a status, so a reminder that could not be delivered came back with
   * a green tick beside it. That reminder is gone: a failed delivery is
   * written to the row as `failed` and never tried again. The first anybody
   * knew was an empty chair.
   *
   * Reminders merely waiting for a channel to be connected stay green — see
   * sweepWentWrong, where that distinction is spelled out and tested.
   */
  const wrong = sweepWentWrong({
    failures: holds.error ? [...failures, `releasing holds: ${holds.error}`] : failures,
    forgetting: tidied.error
      ? [...forgotten.failed, `clearing handled messages: ${tidied.error}`]
      : forgotten.failed,
    unanswered: answered.failed,
    waiting,
    // A weekly report that failed is never retried — the Monday is already
    // claimed on the row — so it has to make the run red or it is lost in
    // silence.
    weeklyFailed: weekly.failed,
  });

  return NextResponse.json(body, { status: wrong ? 500 : 200 });
}
