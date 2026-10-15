/*
 * What one business's reminder costs to send, as a text.
 *
 *   npx tsx scripts/what-a-reminder-costs.mts
 *
 * Written to measure the dash rather than argue about it. The counter is the
 * product's own: segments() in reminderText, which knows that one character
 * outside the GSM alphabet takes the whole message down to 70 a piece.
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import { renderReminder, forOneText, segments } from "../src/lib/reminderText.ts";

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

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const { data: studios } = await db.from("studios").select("id, name, slug, kind");
const { data: templates } = await db
  .from("reminder_templates")
  .select("studio_id, hours_before, body, enabled")
  .eq("enabled", true);

/* A real-shaped filling, so the measurement is of a message somebody gets. */
const values = {
  name: "Julie",
  practitioner: "Amber Hurden",
  business: "Amber's Paws & Pastures",
  when: "tomorrow at 4:00pm",
  link: "",
};

for (const s of (studios ?? []).filter((x) => x.kind !== "demo")) {
  const mine = (templates ?? []).filter((t) => t.studio_id === s.id);
  if (!mine.length) continue;
  console.log(`\n${s.name}`);
  for (const t of mine) {
    const full = renderReminder(t.body as string, values);
    const sent = forOneText(full);

    /*
     * What arrives, rather than what is missing.
     *
     * The first version of this printed full.slice(sent.length) as the part
     * dropped, which is wrong: forOneText trims, so what it returns is not a
     * character-for-character prefix of what went in, and the quote came out
     * a few characters adrift and looked like a message cut mid-word. A
     * measurement that misreports by four characters is worse than none,
     * because it invents a fault in the thing being measured.
     */
    const trimmed = sent.trim() !== full.trim();
    console.log(
      `  ${String(t.hours_before).padStart(2)}h  ${segments(full)} segment(s)` +
        `  ${full.trim().length} chars${trimmed ? `  CUT to ${sent.length}` : ""}`,
    );
    if (trimmed) {
      console.log(`        arrives: ${JSON.stringify(sent)}`);
      console.log(`        written: ${JSON.stringify(full.trim())}`);
    }
  }
}
