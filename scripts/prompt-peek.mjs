/*
 * Print the system prompt a business actually gets, and search it.
 *
 *   npx tsx scripts/prompt-peek.mjs willow-demo
 *   npx tsx scripts/prompt-peek.mjs willow-demo saturday
 *   npx tsx scripts/prompt-peek.mjs willow-demo --all
 *
 * Written on 15 October after an hour spent guessing. Willow & Co, open until
 * 17:00 on a Saturday, kept telling customers "we're open Saturdays 9 to 3".
 * Kerbside, with byte-identical hours, said 9 to 5. I checked the stored
 * hours, the artists' own hours, the FAQs, always_mention, voice_examples and
 * every other field on the row, and found nothing, because the answer was
 * never in the data.
 *
 * It was in the prompt. A rule about phrasing ended with a worked example:
 *
 *   Say "Saturdays 9 to 3".
 *
 * The model was obeying it, word for word, for every business on the platform.
 *
 * None of that was visible from outside, and none of it was findable by
 * reading the database. The prompt is the largest thing this product sends
 * and the only one nobody could look at. Now it can be.
 */
import { db as connect } from "./_tidy.mjs";
import { studioSystemPrompt } from "../src/lib/engine/prompt.ts";

const db = connect();
const [slug, term] = process.argv.slice(2);

if (!slug) {
  console.log("\n  npx tsx scripts/prompt-peek.mjs <slug> [search term | --all]\n");
  process.exit(1);
}

const { data: studio } = await db.from("studios").select("*").eq("slug", slug).maybeSingle();
if (!studio) {
  const { data: all } = await db.from("studios").select("slug").is("archived_at", null);
  console.log(`\n  No business called ${slug}. Try: ${(all ?? []).map((s) => s.slug).join(", ")}\n`);
  process.exit(1);
}

const of = async (table) =>
  (await db.from(table).select("*").eq("studio_id", studio.id)).data ?? [];

const text = studioSystemPrompt(
  studio,
  await of("artists"),
  await of("price_bands"),
  await of("faqs"),
  await of("service_options"),
);

console.log(`\n${studio.name}  (${slug})`);
console.log(`${text.length} characters, roughly ${Math.round(text.length / 4)} tokens\n`);

if (term === "--all") {
  console.log(text);
} else if (term) {
  const hits = text.split("\n").filter((l) => l.toLowerCase().includes(term.toLowerCase()));
  console.log(hits.length ? hits.map((l) => "  " + l.trim()).join("\n") : `  nothing matching "${term}"`);
  console.log("");
} else {
  /* The headings, so there is something to search within. */
  console.log(text.split("\n").filter((l) => l.startsWith("#")).map((l) => "  " + l).join("\n"));
  console.log(`\n  Pass a word to search, or --all for the lot.\n`);
}
