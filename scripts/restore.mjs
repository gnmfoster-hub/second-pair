/**
 * Read a backup back, and say what is in it.
 *
 *   BACKUP_KEY='the same passphrase' node scripts/restore.mjs <file> [table]
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
  console.error("Usage: BACKUP_KEY='…' node scripts/restore.mjs <file> [table]");
  process.exit(1);
}

const raw = fs.readFileSync(file);
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

console.log(
  "\nNothing has been written. Putting rows back is a decision somebody makes " +
    "looking at a specific disaster, not something a script does on its own.",
);
