/**
 * The login for the back office.
 *
 *   node scripts/platform-login.mjs info@second-pair.com
 *
 * Creates an account that owns no business, which is the point: running Second
 * Pair and running a salon are different jobs, and doing both from one login
 * means every screen has to work out which hat you are wearing. This one has no
 * studio at all, so signing in lands straight in the back office.
 *
 * It never sets a password. It prints a one-use link, you follow it, you choose
 * one. Nobody else ever knows it — not this script, not the logs, not me.
 *
 * Safe to run twice: an account that already exists just gets a fresh link,
 * which is also how you get back in if you are ever locked out.
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const email = (process.argv[2] ?? "").trim().toLowerCase();
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error("Usage: node scripts/platform-login.mjs you@yourdomain.com");
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

const site = process.env.SITE_URL ?? "https://www.second-pair.com";

const { data: existing } = await db.auth.admin.listUsers();
const found = existing?.users.find((u) => u.email?.toLowerCase() === email);

if (found) {
  console.log(`${email} already has an account.`);
} else {
  const { error } = await db.auth.admin.createUser({ email, email_confirm: true });
  if (error) {
    console.error(`Could not create it: ${error.message}`);
    process.exit(1);
  }
  console.log(`Created ${email}, with no password and no business.`);
}

const { data: link, error: linkError } = await db.auth.admin.generateLink({
  type: "recovery",
  email,
  options: { redirectTo: `${site}/auth/callback?next=/reset-password` },
});

if (linkError) {
  console.error(`Could not make a link: ${linkError.message}`);
  process.exit(1);
}

console.log(`
Open this once and choose a password:

${link.properties.action_link}

Then add the address to PLATFORM_ADMIN_EMAILS — locally in .env.local and in
Vercel, for all three environments — and redeploy. Keep a second address in
that list as a way back in: locking yourself out of the platform because the
mailbox you gate it with stopped receiving would be a bad afternoon.
`);
