/**
 * Proves the notification path works without needing a browser.
 *
 * Registers a fake subscription against a throwaway studio, sends to it, and
 * checks the two things that actually matter: that a live endpoint is
 * attempted, and that a dead one is cleaned up rather than retried forever.
 *
 *   node scripts/test-push.mjs
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { randomBytes } from "node:crypto";

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

for (const [k, v] of Object.entries(env)) process.env[k] ??= v;

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

let passed = 0;
const failures = [];
const check = (name, ok, detail = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail && !ok ? ` — ${detail}` : ""}`);
  if (ok) passed++;
  else failures.push(name);
};

const { notifyStudio } = await import("../src/lib/notify.ts");

console.log("Keys");
check(
  "a VAPID pair is configured",
  Boolean(env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY),
);
check(
  "the public key is the right length for P-256",
  (env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "").length === 87,
  `${(env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "").length} chars`,
);

const stamp = Date.now();
let studioId;

try {
  const { data: studio, error } = await db
    .from("studios")
    .insert({ name: "Push Test", slug: `push-test-${stamp}` })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  studioId = studio.id;

  console.log("\nSending");

  const quiet = await notifyStudio(db, studioId, { title: "Nobody", body: "listening" });
  check("a studio with no devices sends nothing and does not throw", quiet.sent === 0);

  // A real-looking but unreachable endpoint. Mozilla's push service answers
  // 404 for an id it has never issued, which is exactly the dead-device case.
  const fake = webpush.generateVAPIDKeys();
  const { error: subError } = await db.from("push_subscriptions").insert({
    studio_id: studioId,
    user_id: (await db.auth.admin.listUsers()).data.users[0]?.id,
    endpoint: `https://updates.push.services.mozilla.com/wpush/v2/gone-${stamp}`,
    p256dh: fake.publicKey,
    // The auth secret is exactly 16 bytes; web-push refuses anything shorter
    // before it even reaches the network.
    auth: randomBytes(16).toString("base64url"),
    label: "Fake device",
  });
  check("a subscription can be stored", !subError, subError?.message);

  const result = await notifyStudio(db, studioId, {
    title: "A complaint needs you",
    body: "Someone is unhappy about a colour.",
    url: "/conversations/test",
    tag: "conv-test",
  });

  check(
    "a dead endpoint is deleted rather than retried forever",
    result.removed === 1 && result.sent === 0,
    `sent ${result.sent}, removed ${result.removed}`,
  );

  const { count } = await db
    .from("push_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("studio_id", studioId);
  check("and is gone from the table", count === 0, `${count} left`);
} catch (err) {
  console.error(`\nAborted: ${err.message}`);
  failures.push(err.message);
} finally {
  if (studioId) {
    await db.from("push_subscriptions").delete().eq("studio_id", studioId);
    await db.from("studios").delete().eq("id", studioId);
    console.log("\nCleaned up.");
  }
}

console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
