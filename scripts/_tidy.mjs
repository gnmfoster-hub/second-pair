/*
 * A check that leaves a mess behind is a check somebody stops running.
 *
 * check-speed and check-stream ask a business real questions, so they leave
 * real enquiries in a real inbox. Pointed at Brightwork — the demo deliberately
 * kept empty so it can be used to walk somebody through setting a business up —
 * they had quietly filled it with twenty-four conversations about skimming a
 * ceiling. The demo was no longer empty and nothing had said so.
 *
 * So every check that writes says who it is in the session key and clears its
 * own up afterwards. Prefixes rather than a list of ids, so a run that dies
 * halfway is cleaned by the next one rather than leaving a residue that only
 * ever grows.
 *
 * Deliberately narrow: one business, and only sessions starting with a prefix
 * the checks themselves use. It will not touch a customer's conversation
 * because a customer's session key is a bare uuid.
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

function env() {
  const text = fs.readFileSync(".env.local", "utf8");
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

/**
 * The session keys the checks use, so they can find their own leavings.
 *
 * Anything a check invents that is not in here is never cleared up. A
 * "regular-test" conversation from months ago left a contact called Tom on
 * +447700900123 on the driving school — which is the number the booking check
 * gives — so the assistant quite correctly refused to attach that number to
 * somebody with a different name, and the check reported the business as
 * broken. Half an hour looking for a bug that was a leftover.
 *
 * Add the prefix here the moment a check invents one.
 */
export const CHECK_PREFIXES = [
  "speed",
  "strm",
  "inpg",
  "curl",
  "long",
  "hdr",
  "book",
  "regular-test",
];

export function db() {
  const e = { ...env(), ...process.env };
  return createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Removes everything a run of the checks left on one business.
 *
 * Messages and enquiries go first because nothing here relies on the database
 * cascading, and a contact is only removed when it has nothing else against it
 * — a real client who happens to share a phone number with a test is a real
 * client.
 */
export async function tidyUp(client, slug, prefixes = CHECK_PREFIXES) {
  const { data: studio } = await client.from("studios").select("id").eq("slug", slug).maybeSingle();
  if (!studio) return 0;

  const { data: threads } = await client
    .from("conversations")
    .select("id, contact_id, external_ref")
    .eq("studio_id", studio.id);

  const mine = (threads ?? []).filter((t) =>
    prefixes.some((p) => (t.external_ref ?? "").startsWith(p)),
  );
  if (mine.length === 0) return 0;

  const ids = mine.map((t) => t.id);
  await client.from("messages").delete().in("conversation_id", ids);
  await client.from("enquiries").delete().in("conversation_id", ids);
  await client.from("conversations").delete().in("id", ids);

  for (const contactId of new Set(mine.map((t) => t.contact_id).filter(Boolean))) {
    const { count } = await client
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("contact_id", contactId);
    if (!count) await client.from("contacts").delete().eq("id", contactId);
  }

  await sweepBlanks(client, studio.id);

  return mine.length;
}

/**
 * Contacts with nothing on them and nothing pointing at them.
 *
 * Every conversation opens a blank contact and fills it in when somebody says
 * who they are. A run that dies before that — or a conversation removed by
 * some other route — leaves a row with no name, no number, no email and no
 * conversation: nothing anybody could ever look at, sitting in the client list
 * of a demo that gets shown to people. The driving school had three.
 *
 * Deliberately only the completely empty ones. A contact with so much as a
 * first name on it is somebody, even if nobody has messaged yet.
 */
async function sweepBlanks(client, studioId) {
  const { data: blanks, error } = await client
    .from("contacts")
    .select("id")
    .eq("studio_id", studioId)
    .is("name", null)
    .is("phone", null)
    .is("email", null);

  // A refused query returns no rows, which reads exactly like a clean business.
  if (error) {
    console.error(`  (could not check for blank contacts: ${error.message})`);
    return;
  }

  for (const blank of blanks ?? []) {
    const { count } = await client
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("contact_id", blank.id);
    if (!count) await client.from("contacts").delete().eq("id", blank.id);
  }
}

// Run on its own to sweep a business: node scripts/_tidy.mjs <slug>
if (process.argv[1]?.endsWith("_tidy.mjs")) {
  const slug = process.argv[2] ?? "brightwork-demo";
  const removed = await tidyUp(db(), slug);
  console.log(removed ? `Cleared ${removed} from ${slug}.` : `Nothing of ours on ${slug}.`);
}
