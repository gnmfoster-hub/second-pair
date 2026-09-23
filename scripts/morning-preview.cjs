/*
 * What the morning email would say right now, without sending it.
 *
 * Worth having permanently: the report is the one thing on this project that
 * is supposed to arrive when nobody is looking, so being able to read it on
 * demand is how you tell it is saying something true rather than something
 * reassuring.
 *
 *   node scripts/morning-preview.cjs
 */
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

(async () => {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  const BUCKET = "backups";

  /* The same facts the email gathers, read the same way. */
  const { data: files } = await db.storage
    .from(BUCKET)
    .list("", { limit: 100, sortBy: { column: "name", order: "desc" } });

  const backups = (files ?? []).filter((f) =>
    /^second-pair-\d{4}-\d{2}-\d{2}\.enc$/.test(f.name),
  );
  const newest = backups[0];

  console.log("Backups in the bucket:");
  for (const f of backups.slice(0, 5)) {
    const day = f.name.slice("second-pair-".length, -".enc".length);
    const hours = Math.round((Date.now() - Date.parse(`${day}T00:00:00Z`)) / 3600000);
    console.log(`  ${f.name}  ${hours}h old`);
  }
  if (!newest) console.log("  none");

  for (const name of ["last-attempt.json", "sweep-runs.json"]) {
    const { data } = await db.storage.from(BUCKET).download(name);
    if (!data) {
      console.log(`\n${name}: not written yet`);
      continue;
    }
    const text = await data.text();
    if (name === "sweep-runs.json") {
      const times = JSON.parse(text);
      const day = times.filter((t) => Date.parse(t) > Date.now() - 24 * 3600000);
      let longest = null;
      for (let i = 1; i < day.length; i++) {
        const gap = Math.round((Date.parse(day[i]) - Date.parse(day[i - 1])) / 60000);
        if (longest === null || gap > longest) longest = gap;
      }
      console.log(`\nsweep-runs.json: ${day.length} runs in the last day, longest gap ${longest} minutes`);
    } else {
      console.log(`\n${name}:\n${text}`);
    }
  }

  const dayAgo = new Date(Date.now() - 24 * 3600000).toISOString();
  const { count: failed } = await db
    .from("reminders")
    .select("id", { count: "exact", head: true })
    .eq("status", "failed")
    .gte("due_at", dayAgo);
  const { count: stuck } = await db
    .from("reminders")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending")
    .lt("due_at", dayAgo);

  console.log(`\nReminders: ${failed ?? 0} failed in the last day, ${stuck ?? 0} waiting over a day`);
})();
