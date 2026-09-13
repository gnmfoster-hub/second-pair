/**
 * Four ways to see the demo, so a client can be shown their own view.
 *
 *   node scripts/demo-logins.mjs
 *
 * The demo has had one login since it was built, and it is the owner's. So
 * every demonstration has been of the owner's screen — which is the least
 * interesting one, because it is the only view where everything is visible and
 * nothing is decided for you.
 *
 * What a business actually asks is "what will my stylists see?" and "can they
 * change my prices?", and the honest answer needs showing rather than saying.
 *
 * No passwords are created or printed. The accounts are made, and a sign-in
 * link is generated from the back office when somebody wants one — a password
 * typed into a terminal ends up in a scrollback, a screen recording and a chat
 * log, and these are real accounts on the live system even if the data in them
 * is invented.
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

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

const { data: studio } = await db
  .from("studios")
  .select("id, name, kind")
  .eq("slug", "willow-demo")
  .maybeSingle();

if (!studio) throw new Error("No demo salon. Run demo-salon.mjs first.");
if (studio.kind !== "demo") throw new Error(`${studio.name} is not a demo — refusing.`);

/*
 * Who to show, and why each one is worth showing.
 *
 * Aisha rents her chair: her own prices, her own list, her own reminders, her
 * own assistant name. Jade is employed: the same screens, with the business
 * looking after all of it. Between them they are the whole permission model,
 * and a business watching will recognise one of them as their own.
 */
const VIEWS = [
  {
    email: "demo-aisha@second-pair.com",
    person: "Aisha",
    managed: false,
    shows: "renting a chair — her own prices, her own list, her own reminders",
  },
  {
    email: "demo-jade@second-pair.com",
    person: "Jade",
    managed: true,
    shows: "employed — the business sets everything, her phone stays hers",
  },
  /*
   * And somebody who is not in the diary at all.
   *
   * A receptionist, a manager, the apprentice who answers the phone. They need
   * the inbox and a view of everybody's day; they have no hours, no rates, no
   * column, and must never be offered to a customer as somebody to book with.
   * It is the view a salon asks about second, straight after "can they change
   * my prices", and there has been no way to show it.
   *
   * Done by having no artist row rather than a flag on one — see the migration
   * that made that possible. Which is why this entry names nobody: there is no
   * row in the book to point at, and that is precisely the point.
   */
  {
    email: "demo-reception@second-pair.com",
    person: null,
    managed: false,
    shows: "on the desk — the inbox and everybody's day, no diary of their own",
  },
];

const { data: existing } = await db.auth.admin.listUsers();
const byEmail = new Map(existing.users.map((u) => [u.email?.toLowerCase(), u.id]));

for (const view of VIEWS) {
  let userId = byEmail.get(view.email);

  if (!userId) {
    /*
     * Confirmed on creation and given no password. Somebody signing in gets a
     * link from the back office, which is the same route a real business owner
     * takes and therefore the one worth having working.
     */
    const { data, error } = await db.auth.admin.createUser({
      email: view.email,
      email_confirm: true,
    });
    if (error) {
      console.log(`${view.person}: could not create — ${error.message}`);
      continue;
    }
    userId = data.user.id;
  }

  /*
   * Somebody in the book, or somebody on the desk.
   *
   * A named person is linked to their artist row, which is what gives them a
   * column, hours and rates. Somebody with no name here is deliberately left
   * unlinked: no artist row is exactly what "works here, not in the diary"
   * means, so there is nothing to create and nothing to filter out later.
   */
  if (view.person) {
    const { data: artist } = await db
      .from("artists")
      .select("id")
      .eq("studio_id", studio.id)
      .eq("name", view.person)
      .maybeSingle();

    if (!artist) {
      console.log(`${view.person}: not on the demo — run demo-depth.mjs first`);
      continue;
    }

    await db
      .from("artists")
      .update({ user_id: userId, owner_managed: view.managed })
      .eq("id", artist.id);
  }

  // Staff, not owner. The whole point is that they see less.
  await db
    .from("studio_members")
    .upsert(
      { studio_id: studio.id, user_id: userId, role: "staff" },
      { onConflict: "studio_id,user_id" },
    );

  console.log(`${(view.person ?? "Desk").padEnd(6)} ${view.email.padEnd(32)} ${view.shows}`);
}

console.log("\nNo passwords were set or printed.");
console.log("To sign in as one: admin → the business → send a sign-in link to that address.");
console.log("\nThe owner's view is still demo@second-pair.com.");
