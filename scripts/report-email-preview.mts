/*
 * What the Monday report looks like, without sending it.
 *
 *   npx tsx scripts/report-email-preview.mts [slug] [last_week|this_week|...]
 *
 * Runs the real builder against the real database, so what comes out is what
 * would leave: the same reads, the same figures, the same wording. It writes
 * two files beside itself, the drawn half and the text half, and sends
 * nothing to anybody.
 *
 * With no slug it does all three live businesses, because the layout has to
 * survive a quiet week as well as a busy one and the only honest way to find
 * out is on real weeks.
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import { buildReportEmail } from "../src/lib/reportEmail.ts";
import { reportRange } from "../src/lib/reportRange.ts";

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

const onlySlug = process.argv[2] ?? null;
const which = process.argv[3] ?? "last_week";

const { data: studios, error } = await db
  .from("studios")
  .select("*")
  /*
   * Not filtered on kind = customer, because two of the three live businesses
   * are filed as internal. The two studios that really are ours are named.
   */
  .not("kind", "eq", "demo")
  .not("slug", "in", "(inside,help)")
  .is("archived_at", null)
  .order("name");
if (error) throw new Error(error.message);

const chosen = (studios ?? []).filter((s) => !onlySlug || s.slug === onlySlug);
if (!chosen.length) throw new Error(`no live business matching ${onlySlug}`);

for (const studio of chosen) {
  const tz = studio.timezone ?? "Europe/London";
  const range = reportRange({ range: which }, new Date(), tz);
  const { subject, text, html } = await buildReportEmail(
    db,
    studio as never,
    range,
    "https://www.second-pair.com",
  );

  const stem = new URL(`./report-email-${studio.slug}.html`, import.meta.url);
  fs.writeFileSync(stem, html, "utf8");
  fs.writeFileSync(new URL(`./report-email-${studio.slug}.txt`, import.meta.url), text, "utf8");

  console.log(`${studio.name}`);
  console.log(`  subject  ${subject}`);
  console.log(`  drawn    ${Math.round(html.length / 1024)}KB  ${stem.pathname.slice(1)}`);
  console.log(`  text     ${text.split("\n").length} lines`);
  console.log("");
}
