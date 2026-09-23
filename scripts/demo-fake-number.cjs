/*
 * A number on the Willow demo that can never ring anybody.
 *
 * Giles wanted to see how a number is set up and handed to one person, and
 * there was nothing to assign — Willow has no connections at all.
 *
 * 07700 900xxx is Ofcom's reserved range for drama and fiction. Nothing in it
 * routes anywhere, so nobody can be texted by accident, and this codebase
 * already uses +447700900123 in its own validation message. That makes it the
 * only honest choice: a made-up number outside that range is somebody's.
 *
 * Deliberately left unassigned. Assigning it is the thing he asked to see, and
 * doing it for him would be showing him the finished state rather than the
 * screen.
 *
 * Demos only, and it refuses anything else — a fake number on a live business
 * is actively harmful: the assistant would tell real customers to text a
 * number nobody owns, and reminders would start failing against real
 * appointments.
 *
 *   node scripts/demo-fake-number.cjs            add it
 *   node scripts/demo-fake-number.cjs --remove   take it away again
 */
const { createClient } = require("@supabase/supabase-js");

const SLUG = "willow-demo";
const NUMBER = "+447700900123";

(async () => {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  if (!/-demo$/.test(SLUG)) {
    console.log(`refusing to touch ${SLUG}: demos only`);
    process.exit(1);
  }

  const { data: studio } = await db
    .from("studios")
    .select("id, name, channels_allowed")
    .eq("slug", SLUG)
    .single();

  const removing = process.argv.includes("--remove");

  if (removing) {
    const { error } = await db
      .from("channel_connections")
      .delete()
      .eq("studio_id", studio.id)
      .eq("external_id", NUMBER);
    console.log(error ? `could not remove it: ${error.message}` : "removed.");
    return;
  }

  if (!(studio.channels_allowed ?? []).includes("sms")) {
    console.log(`${studio.name} is not sold texts, so a number would show nowhere.`);
    process.exit(1);
  }

  const { data: already } = await db
    .from("channel_connections")
    .select("id")
    .eq("studio_id", studio.id)
    .eq("external_id", NUMBER);

  if (already?.length) {
    console.log("it is already there.");
    return;
  }

  const { error } = await db.from("channel_connections").insert({
    studio_id: studio.id,
    /* Nobody's, so the owner can be the one to hand it over. */
    artist_id: null,
    channel: "sms",
    external_id: NUMBER,
    label: "Demo number (Ofcom fiction range, never rings)",
    active: true,
  });

  if (error) {
    console.log("could not add it:", error.message);
    process.exit(1);
  }

  console.log(`added ${NUMBER} to ${studio.name}, belonging to nobody.`);
  console.log("Settings -> Channels to hand it to somebody.");
})();
