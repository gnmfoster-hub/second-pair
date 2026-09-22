/*
 * Is the five-minute GitHub Action still calling the sweep?
 *
 * There is no run log to look at, but the reminders themselves record it. If
 * the Action is alive, a reminder is sent within a few minutes of falling due.
 * If only Vercel's once-a-day cron is left, everything is sent at seven in the
 * morning however it was scheduled — and the nightly backup, which only runs
 * when the endpoint is called between two and five, never happens at all.
 *
 * That last part is the reason for asking: check-live has been reporting a
 * stale backup for two days.
 *
 * Read-only.
 */
const { createClient } = require("@supabase/supabase-js");

(async () => {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  const since = new Date(Date.now() - 21 * 24 * 3600_000).toISOString();

  const { data, error } = await db
    .from("reminders")
    .select("due_at, sent_at")
    .not("sent_at", "is", null)
    .gte("sent_at", since)
    .order("sent_at", { ascending: false })
    .limit(200);

  if (error) {
    console.log("could not read the reminders:", error.message);
    process.exit(1);
  }
  if (!data.length) {
    console.log("No reminder has been sent in three weeks, so this cannot say either way.");
    return;
  }

  const hours = new Map();
  let lateBy = [];

  for (const r of data) {
    const sent = new Date(r.sent_at);
    const h = sent.toLocaleString("en-GB", { hour: "2-digit", hour12: false, timeZone: "Europe/London" });
    hours.set(h, (hours.get(h) ?? 0) + 1);
    lateBy.push(Math.round((sent - new Date(r.due_at)) / 60000));
  }

  lateBy.sort((a, b) => a - b);
  const median = lateBy[Math.floor(lateBy.length / 2)];

  console.log(`${data.length} reminders sent in the last three weeks.`);
  console.log(`Median delay between falling due and going out: ${median} minutes.`);
  console.log("\nSent at (London hour):");
  for (const [h, n] of [...hours.entries()].sort()) {
    console.log(`  ${h}:00  ${"#".repeat(Math.min(n, 50))} ${n}`);
  }

  /*
   * Said carefully, because this is easy to over-read.
   *
   * Every call to check-live.mjs hits the same endpoint, so a handful of
   * reminders can be sent at whatever hours somebody happened to run a check.
   * With a few rows the pattern is as much a record of who was at a keyboard
   * as of what is scheduled. It only means something once there are enough of
   * them that the checks are noise.
   */
  if (data.length < 20) {
    console.log(
      `\nToo few to conclude from: ${data.length} reminders is not a pattern, and running ` +
        "check-live calls the same endpoint, so some of these hours may be somebody at a " +
        "keyboard rather than a schedule.",
    );
    console.log(
      median <= 20
        ? "For what it is worth, they went out promptly."
        : "For what it is worth, none of this looks like a five-minute sweep — but look at " +
          "the Actions tab rather than trusting this.",
    );
    return;
  }

  console.log(
    median <= 20
      ? "\nThe five-minute sweep is alive: reminders go out close to when they are due."
      : "\nThe five-minute sweep looks dead: reminders are waiting hours, which is what a once-a-day cron looks like.",
  );
})();
