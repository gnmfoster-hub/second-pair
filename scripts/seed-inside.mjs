/**
 * The assistant inside the product, as its own studio.
 *
 *   node scripts/seed-inside.mjs            say what it would do
 *   node scripts/seed-inside.mjs --write    do it
 *
 * Giles, 15 October: "the internal help one needs to be different as its only
 * to help with issues on the second pair back end where the client logs in. i
 * dont want the second pair marketing agent touched either."
 *
 * So this creates a second studio and the marketing one is not touched: it
 * keeps the `help` slug, its wording, its FAQs and the enquiries attached to
 * it. Nothing here writes to it. The only thing read from it is the set of
 * answers already written for owners, which are copied across rather than
 * retyped, because they are the right answers and they exist.
 *
 * Deliberately bare. No practitioners, no services, no price bands, no
 * reminders, no hours, no deposit. Not because those are switched off but
 * because this is not a business that takes bookings, and the prompt it gets
 * is built from nothing rather than from a diary with the parts suppressed.
 * See src/lib/engine/insidePrompt.ts.
 *
 * Safe to run twice: it updates the studio and replaces its answers.
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");

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

/** Must match INSIDE_SLUG in src/lib/insideHelp.ts. */
const SLUG = process.env.NEXT_PUBLIC_INSIDE_SLUG ?? "inside";
const MARKETING = process.env.NEXT_PUBLIC_SUPPORT_SLUG ?? "help";

const GREETING =
  "Hello. I can help you find your way around Second Pair. What are you trying to do?";

/*
 * The tone column is not the brief any more.
 *
 * On the marketing assistant it is carrying the entire personality, because
 * everything around it describes a business that takes bookings and it has to
 * argue with that. Here the prompt is written for this job, so this is only
 * the voice, and it is short on purpose.
 */
const TONE = `Plain, short and useful, like a colleague who knows the product well.
Name the page. Two or three sentences and stop.`;

console.log(`The assistant inside the product  (${SLUG})\n`);

const { data: marketing } = await db
  .from("studios")
  .select("id, slug, name")
  .eq("slug", MARKETING)
  .maybeSingle();

if (!marketing) {
  console.log(`  note: no studio called "${MARKETING}", so no answers to copy.`);
} else {
  console.log(`  the marketing assistant is "${marketing.slug}" and is not touched`);
}

/* Only the ones written for somebody who already has an account. */
const { data: owned } = marketing
  ? await db
      .from("faqs")
      .select("question, answer, audience, sort_order")
      .eq("studio_id", marketing.id)
      .order("sort_order")
  : { data: [] };

const forOwners = (owned ?? []).filter((f) => f.audience !== "visitor");
console.log(
  `  ${forOwners.length} answers written for owners, of ${(owned ?? []).length} altogether`,
);

const settings = {
  name: "Second Pair",
  slug: SLUG,
  kind: "internal",
  vertical: "general",
  tone: TONE,
  greeting: GREETING,
  assistant_name: "Bebe",
  deposit_rule: { mode: "none" },
  deposit_mode: "none",
  cancellation_policy: "",
  timezone: "Europe/London",
  /* Nothing here asks anybody for their details, so there is nothing to notice. */
  privacy_notice_url: null,
  widget_enabled: true,
};

const { data: existing } = await db
  .from("studios")
  .select("id, slug")
  .eq("slug", SLUG)
  .maybeSingle();

if (!WRITE) {
  console.log(`\n  would ${existing ? "update" : "create"} the studio`);
  console.log(`  would write ${forOwners.length} answers`);
  console.log("\nNothing written. Run again with --write.");
  process.exit(0);
}

let studioId = existing?.id;
if (existing) {
  const { error } = await db.from("studios").update(settings).eq("id", existing.id);
  if (error) throw new Error(`update: ${error.message}`);
  console.log(`  updated ${existing.id}`);
} else {
  const { data: made, error } = await db.from("studios").insert(settings).select("id").single();
  if (error) throw new Error(`create: ${error.message}`);
  studioId = made.id;
  console.log(`  created ${studioId}`);
}

/*
 * Whoever owns the marketing one owns this, so handovers land in the same
 * inbox. Read rather than hard-coded: a user id in a script is the sort of
 * thing that is right once and wrong for ever after.
 */
if (marketing) {
  const { data: owners } = await db
    .from("studio_members")
    .select("user_id, role")
    .eq("studio_id", marketing.id)
    .eq("role", "owner");

  for (const o of owners ?? []) {
    const { data: already } = await db
      .from("studio_members")
      .select("user_id")
      .eq("studio_id", studioId)
      .eq("user_id", o.user_id)
      .maybeSingle();
    if (already) continue;
    const { error } = await db
      .from("studio_members")
      .insert({ studio_id: studioId, user_id: o.user_id, role: "owner" });
    if (error) throw new Error(`member: ${error.message}`);
    console.log("  attached an owner, so handovers reach somebody");
  }
}

await db.from("faqs").delete().eq("studio_id", studioId);
if (forOwners.length) {
  const { error } = await db.from("faqs").insert(
    forOwners.map((f, i) => ({
      studio_id: studioId,
      question: f.question,
      answer: f.answer,
      sort_order: i,
      audience: "owner",
    })),
  );
  if (error) throw new Error(`faqs: ${error.message}`);
  console.log(`  wrote ${forOwners.length} answers`);
}

/* The one thing that would turn it back into a booking assistant. */
const { data: people } = await db.from("artists").select("id").eq("studio_id", studioId);
console.log(
  people?.length
    ? `  WARNING: ${people.length} practitioner(s) here. Remove them.`
    : "  no practitioners, which is what keeps it out of the diary",
);

console.log(`\nTry it at /widget/${SLUG}?embed=1`);
