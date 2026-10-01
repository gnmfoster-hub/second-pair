/*
 * Put some sent-and-due messages on a demo client, so that screen can be looked at.
 *
 *   node scripts/demo-reminders.mjs
 *
 * Written on 1 October, when shortening the customer record turned up something
 * worse than a long page: all 232 reminders in the database belong to the three
 * real businesses. Not one demo had a single one. So the half of that screen
 * Giles was complaining about — "history and planned reminders etc" — could only
 * be looked at by signing into a live business and reading somebody's real
 * customer's messages, which is not a thing to do to check a layout.
 *
 * A demo exists so screens can be looked at. This gives one client the four
 * states that screen draws differently: sent, still to go, failed, and not sent
 * on purpose. The wording is a demo's wording — a made-up person at a made-up
 * business — and says so.
 *
 * Idempotent: it clears whatever it wrote before, so running it twice does not
 * leave a client with eight copies of the same reminder.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const REPO = path.join(process.env.USERPROFILE, "Desktop", "inkdesk");
const envFile = path.join(REPO, ".env.local");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const at = t.indexOf("=");
    if (at < 1) continue;
    const k = t.slice(0, at).trim();
    if (process.env[k] === undefined) process.env[k] = t.slice(at + 1).trim();
  }
}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

/* The marker that makes this undoable. Written into the body of every row. */
const MARK = "[demo]";

const must = (error) => {
  if (error) {
    console.error(error.message);
    process.exit(1);
  }
};

const { data: studios, error: se } = await db
  .from("studios")
  .select("id, name, slug, timezone")
  .is("archived_at", null)
  .like("slug", "%demo%")
  .order("slug");
must(se);

if (!studios?.length) {
  console.log("no demo businesses");
  process.exit(0);
}

/*
 * Willow by preference, because it is the fullest demo and the one the visual
 * checks already point at. Any demo will do if it is not there.
 */
const studio = studios.find((s) => s.slug === "willow-demo") ?? studios[0];

const { data: contacts, error: ce } = await db
  .from("contacts")
  .select("id, name")
  .eq("studio_id", studio.id);
must(ce);

const { data: bookings, error: be } = await db
  .from("bookings")
  .select("id, contact_id, starts_at, type, cancelled_at")
  .in("contact_id", (contacts ?? []).map((c) => c.id))
  .order("starts_at", { ascending: false });
must(be);

if (!bookings?.length) {
  console.log(`${studio.slug} has no bookings against a customer, so there is nothing to attach to`);
  process.exit(0);
}

/* The client with the most, which is the one the record page is worst for. */
const count = new Map();
for (const b of bookings) count.set(b.contact_id, (count.get(b.contact_id) ?? 0) + 1);
const contactId = [...count].sort((a, b) => b[1] - a[1])[0][0];
const contact = contacts.find((c) => c.id === contactId);
const theirs = bookings.filter((b) => b.contact_id === contactId);

/* Clear anything an earlier run left. */
const { data: already, error: ae } = await db
  .from("reminders")
  .select("id, body")
  .in("booking_id", theirs.map((b) => b.id));
must(ae);

const mine = (already ?? []).filter((r) => (r.body ?? "").includes(MARK));
if (mine.length) {
  const { error } = await db.from("reminders").delete().in("id", mine.map((r) => r.id));
  must(error);
  console.log(`cleared ${mine.length} from an earlier run`);
}

const left = (already ?? []).length - mine.length;
if (left) {
  console.log(`leaving ${left} reminder(s) alone that this script did not write`);
}

/*
 * A confirmation and a reminder on the newest few, which is how a real one looks:
 * the confirmation went when it was booked, the reminder the day before.
 *
 * One of each awkward state as well, because those are the ones worth seeing on a
 * screen and the ones no demo has ever had.
 */
const hour = 3_600_000;
const day = 24 * hour;
const rows = [];
const first = (name) => (name ?? "there").split(" ")[0];

theirs.slice(0, 5).forEach((b, i) => {
  const starts = Date.parse(b.starts_at);
  const past = starts < Date.now();

  rows.push({
    booking_id: b.id,
    due_at: new Date(starts - 6 * day).toISOString(),
    status: "sent",
    sent_at: new Date(starts - 6 * day + 40 * 60_000).toISOString(),
    /*
     * One channel. reminders.channel is the channel enum, so "email, sms" is
     * refused — which is how the sender's own bug writing exactly that was
     * found. The list of channels lives in went_on, where there is one.
     */
    channel: "email",
    body: `${MARK} Hello ${first(contact?.name)}, your ${b.type ?? "appointment"} at ${studio.name} is booked in for ${new Date(starts).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}. Reply to this if anything changes.`,
    error: null,
  });

  /* The day-before reminder: sent if the appointment has been, waiting if not. */
  const dueAt = new Date(starts - day).toISOString();
  if (past) {
    rows.push({
      booking_id: b.id,
      due_at: dueAt,
      status: i === 1 ? "failed" : i === 2 ? "skipped" : "sent",
      sent_at: i === 1 || i === 2 ? null : new Date(starts - day + 2 * hour).toISOString(),
      channel: i === 1 || i === 2 ? null : "sms",
      body: `${MARK} Just a reminder about tomorrow at ${new Date(starts).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true })}, ${first(contact?.name)}. See you then.`,
      error:
        i === 1
          ? "The phone number was not accepted by the network"
          : i === 2
            ? "Not sent: this customer asked for no texts"
            : null,
    });
  } else {
    rows.push({
      booking_id: b.id,
      due_at: dueAt,
      status: "pending",
      sent_at: null,
      channel: null,
      body: `${MARK} Just a reminder about tomorrow at ${new Date(starts).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true })}, ${first(contact?.name)}. See you then.`,
      error: null,
    });
  }
});

const { error: ie } = await db.from("reminders").insert(rows);
must(ie);

console.log(
  `\n${studio.name} · ${contact?.name} · wrote ${rows.length} messages across ${Math.min(theirs.length, 5)} bookings`,
);
console.log(`  /clients/${contactId}\n`);
