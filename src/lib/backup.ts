import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * A nightly copy of every business's book, encrypted, kept where the app can
 * write it and nobody can read it.
 *
 * There has been a backup script since the first week, and running it has
 * always been a thing somebody has to remember at the end of a day when they
 * have already done a day's work. The businesses on here have their entire
 * client book in this database — the sort of thing that is not missed until
 * the morning it is gone.
 *
 * Three rules, and they are the whole design:
 *
 *   * Encryption is not a flag. There is no path through this that writes
 *     readable customer data anywhere, because the file is every client's
 *     name and number for every business with none of the database's own
 *     protections around it.
 *   * The key lives only in the environment. No key, no backup, and the
 *     health check says so rather than the job quietly doing nothing.
 *   * Old copies are removed on a schedule. A backup nobody prunes becomes a
 *     bigger and bigger pile of exactly the data you would least like to
 *     leave lying about.
 *
 * The file format is the same one scripts/backup.mjs writes and
 * scripts/restore.mjs reads: salt | nonce | tag | ciphertext. Downloading one
 * and restoring it needs the passphrase and nothing else of ours.
 */

export const BUCKET = "backups";

/**
 * What is worth keeping.
 *
 * The business's own record and everything a business could not rebuild by
 * asking somebody: who its customers are, what was booked, what was charged.
 * Conversations are deliberately left out — they are the largest thing here
 * by an order of magnitude, they are re-creatable in the sense that matters
 * (the bookings they produced are kept), and a copy of every message anybody
 * has ever sent is the last thing that should be sitting in a file.
 */
export const TABLES = [
  "studios",
  "artists",
  "contacts",
  "bookings",
  "booking_groups",
  "services",
  "service_people",
  "price_bands",
  "client_service_times",
  "faqs",
  "reminder_templates",
  "payments",
  "payment_items",
  "client_forms",
  "form_templates",
];

/** One file per day, named so the newest sorts last and a gap is visible. */
export function backupName(when: Date): string {
  return `second-pair-${when.toISOString().slice(0, 10)}.enc`;
}

/**
 * Which files to remove, keeping the newest few.
 *
 * Sorted by name, which is sorted by date because of how they are named.
 * Anything that is not one of ours is left alone: this deletes things, and a
 * rule that deletes what it does not recognise is how somebody's unrelated
 * file disappears.
 */
export function whichToDelete(names: string[], keep = 14): string[] {
  const ours = names.filter((n) => /^second-pair-\d{4}-\d{2}-\d{2}\.enc$/.test(n)).sort();
  return ours.slice(0, Math.max(0, ours.length - keep));
}

/** Encrypted with a key derived from the passphrase, never the passphrase itself. */
export function seal(plain: Buffer, passphrase: string): Buffer {
  const salt = crypto.randomBytes(16);
  const nonce = crypto.randomBytes(12);
  const key = crypto.scryptSync(passphrase, salt, 32);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, nonce);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([salt, nonce, cipher.getAuthTag(), body]);
}

/** The other half, so the round trip can be proved rather than assumed. */
export function unseal(file: Buffer, passphrase: string): Buffer {
  const salt = file.subarray(0, 16);
  const nonce = file.subarray(16, 28);
  const tag = file.subarray(28, 44);
  const body = file.subarray(44);
  const key = crypto.scryptSync(passphrase, salt, 32);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]);
}

export type BackupOutcome =
  | { ran: false; because: "no key" | "already today" }
  | { ran: true; rows: number; bytes: number; name: string; removed: number }
  | { ran: false; because: "failed"; error: string };

/**
 * Take tonight's copy, unless there is one already.
 *
 * Deciding by what is in the bucket rather than by a timestamp in a table:
 * the files are the record, so they cannot disagree with it. Safe to call as
 * often as the scheduled job runs.
 */
export async function nightlyBackup(
  db: SupabaseClient,
  options: { passphrase?: string | null; keep?: number; now?: Date } = {},
): Promise<BackupOutcome> {
  const passphrase = options.passphrase ?? process.env.BACKUP_KEY ?? null;
  if (!passphrase || passphrase.length < 16) return { ran: false, because: "no key" };

  const now = options.now ?? new Date();
  const name = backupName(now);

  try {
    // The bucket, made once and private. Public here would be every client's
    // details on a guessable URL.
    const { data: buckets } = await db.storage.listBuckets();
    if (!buckets?.some((b) => b.name === BUCKET)) {
      await db.storage.createBucket(BUCKET, { public: false });
    }

    const { data: existing } = await db.storage.from(BUCKET).list("", { limit: 100 });
    const names = (existing ?? []).map((f) => f.name);
    if (names.includes(name)) return { ran: false, because: "already today" };

    const dump: { takenAt: string; tables: Record<string, unknown[]> } = {
      takenAt: now.toISOString(),
      tables: {},
    };
    let rows = 0;

    for (const table of TABLES) {
      const all: unknown[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await db.from(table).select("*").range(from, from + 999);
        /*
         * A table that is not there yet is not a failure — a deploy can land
         * before its migration, and a backup that refuses everything because
         * one table is missing is a backup that does not happen.
         */
        if (error) {
          if (/does not exist|schema cache/i.test(error.message)) break;
          return { ran: false, because: "failed", error: `${table}: ${error.message}` };
        }
        all.push(...(data ?? []));
        if ((data ?? []).length < 1000) break;
      }
      dump.tables[table] = all;
      rows += all.length;
    }

    const sealed = seal(Buffer.from(JSON.stringify(dump), "utf8"), passphrase);

    const { error: upError } = await db.storage
      .from(BUCKET)
      .upload(name, sealed, { contentType: "application/octet-stream", upsert: true });
    if (upError) return { ran: false, because: "failed", error: upError.message };

    const going = whichToDelete([...names, name], options.keep ?? 14);
    if (going.length) await db.storage.from(BUCKET).remove(going);

    return { ran: true, rows, bytes: sealed.length, name, removed: going.length };
  } catch (e) {
    return { ran: false, because: "failed", error: (e as Error).message };
  }
}

/**
 * What is actually in the bucket, rather than what ought to be.
 *
 * Every check we had asked the environment: is a key set, is it the right
 * hour. Both can be true for months while nothing is written — the key can be
 * fine and the write can fail every night at two in the morning, when nobody
 * is looking. The only honest question is whether a file is there and how old
 * it is.
 */
/** Where the last attempt's answer is kept. Not a backup, so never tidied away. */
export const ATTEMPT_FILE = "last-attempt.json";

export type BackupAttempt = {
  /** When it was tried. */
  at: string;
  /** What nightlyBackup said, verbatim. */
  outcome: BackupOutcome;
};

/**
 * Writes down what the last attempt did, whether it worked or not.
 *
 * nightlyBackup answers with a value rather than throwing, and the scheduled
 * job dropped that answer on the floor. So when two nights running produced no
 * file, there was nothing anywhere saying why — not a log line, not a row, not
 * a flag. Afterwards every part could be checked and every part worked: the
 * key was set, all fifteen tables read, the bucket listed, a 600KB upload
 * succeeded, and the job had run inside the window on both nights. The one
 * thing that could not be recovered was what happened at the time.
 *
 * A file in the same bucket, because the bucket is already the record for
 * backups and this needs no migration. whichToDelete only ever removes names
 * matching the dated backup pattern, so this cannot be tidied away by mistake.
 *
 * Never throws and never fails the backup: this exists to report, and a
 * reporter that can break the thing it reports on is worse than none.
 */
export async function recordAttempt(
  db: SupabaseClient,
  outcome: BackupOutcome,
  now: Date = new Date(),
): Promise<void> {
  try {
    const body: BackupAttempt = { at: now.toISOString(), outcome };
    await db.storage
      .from(BUCKET)
      .upload(ATTEMPT_FILE, Buffer.from(JSON.stringify(body, null, 1), "utf8"), {
        contentType: "application/json",
        upsert: true,
      });
  } catch (e) {
    console.error("[backup] could not record the attempt:", (e as Error)?.message);
  }
}

/** What the last attempt said, for anything that wants to report on it. */
export async function lastAttempt(db: SupabaseClient): Promise<BackupAttempt | null> {
  try {
    const { data, error } = await db.storage.from(BUCKET).download(ATTEMPT_FILE);
    if (error || !data) return null;
    return JSON.parse(await data.text()) as BackupAttempt;
  } catch {
    return null;
  }
}

export async function newestBackup(
  db: SupabaseClient,
): Promise<{ name: string; bytes: number; hoursOld: number } | null> {
  try {
    const { data, error } = await db.storage
      .from(BUCKET)
      .list("", { limit: 100, sortBy: { column: "name", order: "desc" } });

    if (error || !data?.length) return null;

    const ours = data.filter((f) => /^second-pair-\d{4}-\d{2}-\d{2}\.enc$/.test(f.name));
    const newest = ours[0];
    if (!newest) return null;

    const day = newest.name.slice("second-pair-".length, -".enc".length);
    const taken = Date.parse(`${day}T00:00:00Z`);

    return {
      name: newest.name,
      bytes: (newest.metadata as { size?: number } | null)?.size ?? 0,
      hoursOld: Math.round((Date.now() - taken) / 3_600_000),
    };
  } catch {
    // A bucket we cannot read is not a bucket with a backup in it.
    return null;
  }
}

/** A backup older than this has not been taken, whatever the settings say. */
export const STALE_AFTER_HOURS = 36;
