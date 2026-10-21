/**
 * Read a backup back, and say what is in it.
 *
 *   BACKUP_KEY='the same passphrase' node scripts/restore.mjs latest [table]
 *   BACKUP_KEY='the same passphrase' node scripts/restore.mjs <file> [table]
 *
 * "latest" fetches last night's out of the bucket itself, which is the point
 * of it being there: the monthly check below used to start with "log into
 * Supabase, find storage, find the backups bucket, download the newest file",
 * and a check with four steps in front of the useful one is a check nobody
 * runs. It reads the service key out of .env.local the way every other script
 * here does.
 *
 * It decrypts and reports. It does not write to the database, and that is
 * deliberate: putting rows back is a decision about what to overwrite, made by
 * somebody looking at a specific disaster, and a script that does it
 * unattended is a script that can cause one.
 *
 * A backup nobody has ever read back is a hope rather than a backup. Run this
 * against last night's once a month; it takes ten seconds and it is the only
 * way to find out that the passphrase in the password manager is the old one.
 */
import fs from "node:fs";
import crypto from "node:crypto";

const KEY = process.env.BACKUP_KEY;
const file = process.argv[2];
const only = process.argv[3];

if (!KEY || !file) {
  console.error("Usage: BACKUP_KEY='…' node scripts/restore.mjs latest|<file> [table]");
  process.exit(1);
}

/*
 * Kept so the success at the bottom can leave a note saying it worked.
 * Only set when the file came from the bucket: reading a file somebody has
 * on a laptop proves the passphrase, not that what is stored is readable.
 */
let bucket = null;
let fetched = null;

/** Last night's, straight out of the bucket, without touching a browser. */
async function newestFromTheBucket() {
  const env = Object.fromEntries(
    fs
      .readFileSync(new URL("../.env.local", import.meta.url), "utf8")
      .split(/\r?\n/)
      .filter((l) => l.trim() && !l.startsWith("#"))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      }),
  );

  const { createClient } = await import("@supabase/supabase-js");
  bucket = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const db = bucket;

  const { data, error } = await db.storage.from("backups").list("", { limit: 200 });
  if (error) throw new Error(`could not list the bucket: ${error.message}`);

  const ours = (data ?? [])
    .filter((f) => /^second-pair-\d{4}-\d{2}-\d{2}\.enc$/.test(f.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  const newest = ours[ours.length - 1];
  if (!newest) throw new Error("there is no backup in the bucket at all");

  const { data: blob, error: grab } = await db.storage.from("backups").download(newest.name);
  if (grab) throw new Error(`could not download ${newest.name}: ${grab.message}`);

  fetched = newest.name;
  const age = Math.round((Date.now() - Date.parse(newest.created_at)) / 3_600_000);
  console.log(`${newest.name}, ${age} hours old, ${ours.length} backups kept\n`);
  return Buffer.from(await blob.arrayBuffer());
}

const raw = file === "latest" ? await newestFromTheBucket() : fs.readFileSync(file);
const salt = raw.subarray(0, 16);
const nonce = raw.subarray(16, 28);
const tag = raw.subarray(28, 44);
const body = raw.subarray(44);

const key = crypto.scryptSync(KEY, salt, 32);
const decipher = crypto.createDecipheriv("aes-256-gcm", key, nonce);
decipher.setAuthTag(tag);

let dump;
try {
  const plain = Buffer.concat([decipher.update(body), decipher.final()]);
  dump = JSON.parse(plain.toString("utf8"));
} catch {
  /*
   * The tag failing and the passphrase being wrong are the same error, and
   * saying both is more useful than guessing which — one means somebody has
   * altered the file, and that is worth knowing rather than shrugging at.
   */
  console.error(
    "Could not read it. Either the passphrase is wrong, or the file has been " +
      "altered since it was written — the check that catches tampering is the " +
      "same one that catches a bad key.",
  );
  process.exit(1);
}

console.log(`Taken ${dump.takenAt}\n`);

for (const [table, rows] of Object.entries(dump.tables)) {
  if (only && table !== only) continue;
  console.log(`${table.padEnd(22)} ${rows.length}`);
}

if (only) {
  const rows = dump.tables[only] ?? [];
  console.log(`\nFirst row of ${only}:`);
  console.log(JSON.stringify(rows[0] ?? null, null, 2).slice(0, 1200));
}

/*
 * One line written down, and it is not a row.
 *
 * The note says a backup was opened and read, so the morning email can stop
 * asking. Nothing else here writes anything, and that stays true: putting
 * rows back is a decision somebody makes looking at a specific disaster.
 *
 * Only for a file out of the bucket. Reading a copy somebody already has on
 * a laptop proves the passphrase works on that copy, which is not the same
 * as proving that what is stored tonight can be opened.
 */
if (bucket && fetched) {
  const note = { at: new Date().toISOString(), file: fetched, tables: Object.keys(dump.tables).length };
  const { error } = await bucket.storage
    .from("backups")
    .upload("last-restore-check.json", Buffer.from(JSON.stringify(note), "utf8"), {
      contentType: "application/json",
      upsert: true,
    });
  if (error) console.error(`(could not write the note: ${error.message})`);
  else console.log("\nNoted. The morning email will stop asking for about a month.");
}

console.log(
  "\nNothing has been put back. Restoring rows is a decision somebody makes " +
    "looking at a specific disaster, not something a script does on its own.",
);
