/**
 * The invitation flow, and the ways it must not work.
 *
 *   node scripts/test-invites.mjs
 *
 * An invite link is a credential. It has to let exactly one person into
 * exactly one business, once, and stop working afterwards.
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

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

let passed = 0;
const failures = [];
const check = (name, ok, detail = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail && !ok ? ` — ${detail}` : ""}`);
  if (ok) passed++;
  else failures.push(name);
};

const stamp = Date.now();
const made = { users: [], studios: [] };

/** A signed-in client for a throwaway user. */
async function person(label) {
  const email = `invite-${label}-${stamp}@example.test`;
  const password = `pw-${stamp}-${label}`;

  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw new Error(`${label}: ${error.message}`);
  made.users.push(created.user.id);

  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { error: signIn } = await client.auth.signInWithPassword({ email, password });
  if (signIn) throw new Error(`${label} sign-in: ${signIn.message}`);

  return { id: created.user.id, client };
}

try {
  const owner = await person("owner");
  const staff = await person("staff");
  const stranger = await person("stranger");

  const { data: studioId, error: makeError } = await owner.client.rpc("create_studio", {
    studio_name: "Invite Test",
    studio_slug: `invite-test-${stamp}`,
  });
  if (makeError) throw new Error(makeError.message);
  made.studios.push(studioId);

  const { data: artist } = await admin
    .from("artists")
    .insert({
      studio_id: studioId,
      name: "Sarah Nolan",
      handle: "sarah",
      hourly_rate_pence: 5000,
      min_charge_pence: 2500,
    })
    .select("id")
    .single();

  console.log("Inviting somebody");

  const { data: invite, error: inviteError } = await owner.client
    .from("team_invites")
    .insert({ studio_id: studioId, artist_id: artist.id, role: "staff" })
    .select("token")
    .single();
  check("the owner can create an invite", !inviteError, inviteError?.message);
  check("it carries a long random token", (invite?.token ?? "").length === 64);

  const { error: strangerMake } = await stranger.client
    .from("team_invites")
    .insert({ studio_id: studioId, artist_id: artist.id, role: "staff" });
  check("a stranger cannot create one for somebody else's business", Boolean(strangerMake));

  console.log("\nAccepting it");

  const { data: joined, error: joinError } = await staff.client.rpc("accept_team_invite", {
    invite_token: invite.token,
  });
  check("the invited person joins the business", !joinError && joined === studioId, joinError?.message);

  const { data: attached } = await admin
    .from("artists")
    .select("user_id")
    .eq("id", artist.id)
    .single();
  check("their login is attached to the right person", attached.user_id === staff.id);

  const { data: membership } = await admin
    .from("studio_members")
    .select("role")
    .eq("studio_id", studioId)
    .eq("user_id", staff.id)
    .maybeSingle();
  check("they are a member, as staff rather than owner", membership?.role === "staff");

  console.log("\nThe ways it must not work");

  const { error: reuse } = await stranger.client.rpc("accept_team_invite", {
    invite_token: invite.token,
  });
  check("the same link cannot be used twice", Boolean(reuse));

  const { data: stillStaff } = await admin
    .from("artists")
    .select("user_id")
    .eq("id", artist.id)
    .single();
  check("and the second attempt did not steal the person", stillStaff.user_id === staff.id);

  const { error: madeUp } = await stranger.client.rpc("accept_team_invite", {
    invite_token: "f".repeat(64),
  });
  check("a made-up token is refused", Boolean(madeUp));

  // Expiry is enforced in SQL, so it is tested by moving the clock on a row.
  const { data: second } = await admin
    .from("team_invites")
    .insert({
      studio_id: studioId,
      artist_id: artist.id,
      role: "staff",
      expires_at: new Date(Date.now() - 86400_000).toISOString(),
    })
    .select("token")
    .single();

  const { error: expired } = await stranger.client.rpc("accept_team_invite", {
    invite_token: second.token,
  });
  check("an expired link is refused", Boolean(expired));

  const { data: strangerSees } = await stranger.client
    .from("team_invites")
    .select("id")
    .eq("studio_id", studioId);
  check("a stranger cannot read the invites", (strangerSees ?? []).length === 0);
} catch (err) {
  console.error(`\nAborted: ${err.message}`);
  failures.push(err.message);
} finally {
  for (const id of made.studios) {
    // The service role is not a member, so the RPC refuses it; deleting the
    // bookings by hand is what the erasure function does anyway.
    const { data: team } = await admin.from("artists").select("id").eq("studio_id", id);
    if (team?.length) {
      await admin.from("bookings").delete().in("artist_id", team.map((a) => a.id));
    }
    await admin.from("conversations").delete().eq("studio_id", id);
    await admin.from("studios").delete().eq("id", id);
  }
  for (const id of made.users) await admin.auth.admin.deleteUser(id).catch(() => {});
  console.log("\nCleaned up.");
}

console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
