/*
 * Why no weekly report has ever arrived, and whether the channel choice is
 * reachable at all.
 *
 *   node scripts/why-no-email.mjs
 *
 * Both questions have the same shape: a feature that exists in the code and
 * may be switched off, or may be waiting on a column nobody has added. From
 * the outside those look identical, and guessing between them has cost a day
 * on this project before.
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

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

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

console.log("Columns these features need:");
for (const [table, column] of [
  ["studios", "weekly_report_email"],
  ["studios", "weekly_report_sent_on"],
  ["studios", "message_channels"],
  ["studios", "allow_both_channels"],
  ["reminder_templates", "channels"],
]) {
  const { error } = await db.from(table).select(column).limit(0);
  console.log(`  ${table}.${column}: ${error ? `MISSING (${error.code})` : "there"}`);
}

const { data: studios } = await db.from("studios").select("*").order("name");
console.log("\nPer business:");
for (const s of studios ?? []) {
  if (s.kind === "demo") continue;
  console.log(
    `  ${s.name}\n` +
      `    weekly report: ${s.weekly_report_email === true ? "ON" : "off"}` +
      `, last sent ${s.weekly_report_sent_on ?? "never"}\n` +
      `    daily brief:   ${s.daily_brief_email === true ? "ON" : "off"}` +
      `, last sent ${s.daily_brief_sent_on ?? "never"}\n` +
      `    channels:      ${s.message_channels ?? "(not set, so as they came)"}` +
      `, both allowed: ${s.allow_both_channels === true}`,
  );

  /* And whether there is anybody to send to, which is the other way it goes quiet. */
  const { data: owners } = await db
    .from("studio_members")
    .select("user_id")
    .eq("studio_id", s.id)
    .eq("role", "owner");
  const emails = [];
  for (const o of owners ?? []) {
    const { data } = await db.auth.admin.getUserById(o.user_id);
    if (data.user?.email) emails.push(data.user.email);
  }
  console.log(`    owners:        ${emails.join(", ") || "NOBODY, so nothing could be sent"}`);
}

/* Email has to be configured at all, or every one of these fails quietly. */
console.log(
  `\nEmail sending: RESEND_API_KEY ${env.RESEND_API_KEY ? "set" : "NOT SET"}` +
    `, from address ${env.EMAIL_FROM ?? env.RESEND_FROM ?? "NOT SET"}`,
);
