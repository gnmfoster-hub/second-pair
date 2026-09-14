/**
 * A nightly copy of the diary and the client book, encrypted.
 *
 *   BACKUP_KEY='a long passphrase' node scripts/backup.mjs [outputDir]
 *
 * Supabase already takes its own backups of the whole database, and that is
 * the thing that saves you if a table is dropped at three in the morning. This
 * is for the other cases: losing the Supabase account itself, needing to put
 * one business back without restoring everybody, or wanting to keep something
 * longer than the plan retains.
 *
 * ── What it deliberately does not copy ──────────────────────────────────────
 *
 * Conversations. Every word every customer has ever written to every business
 * is the most sensitive thing this product holds and it is not needed to
 * rebuild a diary. A backup that leaves it out cannot leak it, and "we do not
 * copy those" is a sentence worth being able to say.
 *
 * ── Why it refuses to run without a key ─────────────────────────────────────
 *
 * The file is every client's name, phone number and email for every business
 * on the platform, in one place, with none of the row-level security that
 * protects them in the database. Getting at that today means defeating
 * per-tenant policies one business at a time; a plain-text backup file means
 * finding one file.
 *
 * So encryption is not a flag. There is no unencrypted path through this
 * script, because the safe shape has to be the only shape rather than the one
 * somebody means to pick.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const KEY = process.env.BACKUP_KEY;

if (!KEY || KEY.length < 16) {
  console.error(
    "Refusing to run.\n\n" +
      "Set BACKUP_KEY to a passphrase of at least 16 characters. This file holds\n" +
      "every client's name and number for every business, with none of the\n" +
      "database's protections, so there is no unencrypted path through here.\n\n" +
      "Keep the passphrase somewhere other than the backups. A key stored beside\n" +
      "what it encrypts is a longer filename.",
  );
  process.exit(1);
}

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const outDir = process.argv[2] || "backups";
fs.mkdirSync(outDir, { recursive: true });

/*
 * What is worth being able to put back.
 *
 * The diary, the people whose diary it is, the client book, and what a business
 * sells — which together are everything somebody would have to retype by hand.
 * Everything else is either derivable, replaceable, or too sensitive to be
 * worth the copy.
 */
const TABLES = [
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

  /*
   * And the money, which was not in here at all.
   *
   * This file is as old as the diary and payments are newer than it, so the
   * list simply never learned about them: every deposit taken, every bottle
   * sold at the till, every refund — the whole of what a quarter is made of —
   * was outside the only copy of this database we hold ourselves.
   *
   * It is also the part that cannot be reconstructed from anything else. A
   * booking can be re-entered from a customer's memory and a phone number can
   * be asked for again; what somebody paid in March cannot be worked out from
   * first principles, and it is the one thing an accountant will ask for.
   *
   * The lines as well as the totals. A sale that says "£38.00, products" and
   * cannot say what they were is half a record, and the half it is missing is
   * the one a shop reads at the end of a month.
   */
  "payments",
  "payment_items",
];

const dump = { takenAt: new Date().toISOString(), tables: {} };
let rows = 0;

for (const table of TABLES) {
  /*
   * Paged, because a single select quietly stops at a thousand rows and a
   * backup that silently holds the first thousand clients is worse than no
   * backup — it looks like one.
   */
  const all = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select("*").range(from, from + 999);
    if (error) {
      console.error(`\n${table}: ${error.message}`);
      process.exit(1);
    }
    all.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }

  dump.tables[table] = all;
  rows += all.length;
  console.log(`  ${table.padEnd(22)} ${all.length}`);
}

/*
 * AES-256-GCM with a random salt and nonce each night.
 *
 * GCM rather than CBC so the file cannot be altered without the decryption
 * failing — a backup somebody has quietly edited is worse than one they have
 * read. scrypt rather than a raw passphrase so a weak one costs an attacker
 * real time.
 */
const salt = crypto.randomBytes(16);
const nonce = crypto.randomBytes(12);
const key = crypto.scryptSync(KEY, salt, 32);
const cipher = crypto.createCipheriv("aes-256-gcm", key, nonce);

const plain = Buffer.from(JSON.stringify(dump), "utf8");
const body = Buffer.concat([cipher.update(plain), cipher.final()]);
const tag = cipher.getAuthTag();

const stamp = new Date().toISOString().slice(0, 10);
const file = path.join(outDir, `second-pair-${stamp}.enc`);

// salt | nonce | tag | ciphertext, so restore needs the passphrase and nothing else.
fs.writeFileSync(file, Buffer.concat([salt, nonce, tag, body]), { mode: 0o600 });

console.log(`\n${rows} rows from ${TABLES.length} tables`);
console.log(`${file} — ${(fs.statSync(file).size / 1024).toFixed(0)} KB, encrypted`);
console.log("\nRestore with: node scripts/restore.mjs <file>");
console.log(
  "Conversations are deliberately not in here. Nothing a customer wrote is copied.",
);
