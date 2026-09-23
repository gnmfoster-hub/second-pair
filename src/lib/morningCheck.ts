/**
 * The morning email: is anything broken, said once a day.
 *
 * Giles asked to be told every morning whether the backup worked, and then for
 * everything else checked too — anything wrong, in one message.
 *
 * The reason it is worth having is the two nights that prompted it. The backup
 * silently stopped producing files, and nothing anywhere said so. Every check
 * that existed had to be run by hand from a laptop, which means it is run when
 * somebody already suspects something, which is the one time monitoring is not
 * needed.
 *
 * Two rules it is built around:
 *
 * A quiet morning still sends. A report that only arrives when something is
 * wrong is indistinguishable from a report that has stopped working, and this
 * exists precisely because a thing that stopped working said nothing.
 *
 * And it leads with the verdict. An email that opens with nine lines of detail
 * gets skimmed and then ignored within a week; one that opens with "all well"
 * or "two things wrong" can be read from a lock screen.
 *
 * Kept apart from the database and the mailer so the awkward combinations can
 * be tested — the same reason reminderCover.ts and reminderSchedule.ts are.
 */

export type Check = {
  /** What was looked at, in words an owner would use. */
  what: string;
  /** Whether it is fine. */
  ok: boolean;
  /** What is true, said either way. */
  detail: string;
  /**
   * Wrong but not urgent — a warning rather than a failure. Test mode is the
   * example: right for a demo, wrong for a real business, and not an outage.
   */
  warn?: boolean;
};

export type MorningReport = {
  subject: string;
  text: string;
  /** How many are actually broken, so a caller can decide whether to shout. */
  bad: number;
};

/**
 * Rolls the checks into the email.
 *
 * `day` is passed rather than read from a clock so a test can fix the date,
 * and so the subject line matches the day the checks describe rather than the
 * moment the mail happened to be composed.
 */
export function morningReport(checks: Check[], day: string, site: string): MorningReport {
  const bad = checks.filter((c) => !c.ok && !c.warn);
  const warned = checks.filter((c) => !c.ok && c.warn);

  /*
   * The verdict in the subject, because on a phone that is often all that is
   * read. "Second Pair: all well" scrolling past at seven in the morning is
   * the whole product of this email on a good day.
   */
  const subject = bad.length
    ? `Second Pair: ${bad.length} thing${bad.length === 1 ? "" : "s"} wrong`
    : warned.length
      ? `Second Pair: all well (${warned.length} to note)`
      : "Second Pair: all well";

  const lines: string[] = [];
  lines.push(subject.replace(/^Second Pair: /, "").replace(/^./, (c) => c.toUpperCase()));
  lines.push(`Checked ${day}.`);
  lines.push("");

  if (bad.length) {
    lines.push("WRONG");
    for (const c of bad) lines.push(`  ${c.what}: ${c.detail}`);
    lines.push("");
  }

  if (warned.length) {
    lines.push("WORTH KNOWING");
    for (const c of warned) lines.push(`  ${c.what}: ${c.detail}`);
    lines.push("");
  }

  /*
   * And everything that passed, listed rather than counted.
   *
   * "12 checks passed" tells you nothing about what was actually looked at, so
   * the morning a check silently stops being run, the number goes down by one
   * and nobody notices. The names are the point.
   */
  const fine = checks.filter((c) => c.ok);
  if (fine.length) {
    lines.push("FINE");
    for (const c of fine) lines.push(`  ${c.what}: ${c.detail}`);
    lines.push("");
  }

  lines.push(site);

  return { subject, text: lines.join("\n"), bad: bad.length };
}

/**
 * One a day, whatever the sweep's cadence.
 *
 * The job behind this is scheduled every five minutes and GitHub actually runs
 * it every two to five hours, so "the morning run" is not a thing that exists
 * — any call after the hour below has to be able to send, and the rest of the
 * day's calls must not. Keyed by date, and claimed the same way platform
 * alerts claim an hour.
 */
export function morningKey(day: string): string {
  return `morning:${day}`;
}

/** The day in London, which is the day the person reading this is having. */
export function londonDay(at: Date): string {
  /* en-CA gives YYYY-MM-DD, which sorts and reads the same everywhere. */
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(at);
}

/** The hour in London, for deciding whether it is yet morning. */
export function londonHour(at: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "numeric",
      hour12: false,
      timeZone: "Europe/London",
    }).format(at),
  );
}

/**
 * Whether this call should send it.
 *
 * From six, because the backup runs between two and five and a report that
 * goes out at four says nothing about the night it is reporting on.
 */
export const FROM_HOUR = 6;

export function isMorning(at: Date): boolean {
  return londonHour(at) >= FROM_HOUR;
}
