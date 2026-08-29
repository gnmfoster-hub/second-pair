// End-to-end check that tenant isolation actually holds against the live
// database. Creates two throwaway studios owned by two throwaway users, then
// tries every cross-tenant read and write that must fail.
//
// Prints pass/fail only, never credentials. Cleans up after itself.
// Run: node scripts/verify-rls.mjs

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const env = Object.fromEntries(
  readFileSync(join(root, ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !ANON || !SERVICE) {
  console.error("Missing values in .env.local. Run: node scripts/pull-env.mjs");
  process.exit(1);
}

const admin = createClient(URL, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let passed = 0;
const failures = [];

function check(name, ok, detail = "") {
  if (ok) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const stamp = Date.now();
const users = [];

async function makeUser(tag) {
  const email = `rlstest+${tag}${stamp}@inkdesk.test`;
  const password = `pw-${stamp}-${tag}-${Math.random().toString(36).slice(2)}`;

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw new Error(`createUser ${tag}: ${error.message}`);
  users.push(data.user.id);

  const client = createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error(`signIn ${tag}: ${signInError.message}`);

  return { client, id: data.user.id };
}

async function cleanup(studioIds) {
  for (const id of studioIds.filter(Boolean)) {
    // Conversations first: the cascade frees the bookings that would otherwise
    // block deleting artists via bookings.artist_id's `on delete restrict`.
    await admin.from("conversations").delete().eq("studio_id", id);
    const { error } = await admin.from("studios").delete().eq("id", id);
    // Loud, not silent: an earlier version of this script leaked a test studio
    // into the live database because it ignored this error.
    if (error) console.log(`  WARN  could not delete test studio ${id}: ${error.message}`);
  }
  for (const id of users) {
    await admin.auth.admin.deleteUser(id);
  }

  const { data: strays } = await admin.from("studios").select("id").like("slug", "lc-test-%");
  if (strays?.length) console.log(`  WARN  ${strays.length} test studio(s) left behind`);
}

const studioIds = [];

try {
  console.log("\nSigning in two separate studio owners");
  const a = await makeUser("a");
  const b = await makeUser("b");

  // ---------------------------------------------------------------- create_studio RPC

  console.log("\ncreate_studio RPC");

  const { data: studioA, error: rpcErrorA } = await a.client.rpc("create_studio", {
    studio_name: "Living Canvas Test A",
    studio_slug: `lc-test-a-${stamp}`,
  });
  check("owner A can create a studio", !rpcErrorA && Boolean(studioA), rpcErrorA?.message);
  studioIds.push(studioA);

  const { data: studioB, error: rpcErrorB } = await b.client.rpc("create_studio", {
    studio_name: "Living Canvas Test B",
    studio_slug: `lc-test-b-${stamp}`,
  });
  check("owner B can create a studio", !rpcErrorB && Boolean(studioB), rpcErrorB?.message);
  studioIds.push(studioB);

  const { data: memberRow } = await a.client
    .from("studio_members")
    .select("role")
    .eq("studio_id", studioA)
    .eq("user_id", a.id)
    .maybeSingle();
  check("creator is recorded as owner", memberRow?.role === "owner");

  const anonClient = createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: anonRpcError } = await anonClient.rpc("create_studio", {
    studio_name: "Should not exist",
    studio_slug: `nope-${stamp}`,
  });
  check("signed-out caller cannot create a studio", Boolean(anonRpcError));

  // ---------------------------------------------------------------- studio isolation

  console.log("\nStudio isolation");

  const { data: aSees } = await a.client.from("studios").select("id");
  check("owner A sees exactly their own studio", aSees?.length === 1 && aSees[0].id === studioA,
    `saw ${aSees?.length ?? 0}`);

  const { data: aSeesB } = await a.client.from("studios").select("id").eq("id", studioB);
  check("owner A cannot read studio B", (aSeesB ?? []).length === 0);

  const { error: renameError } = await a.client
    .from("studios")
    .update({ name: "Hijacked" })
    .eq("id", studioB);
  const { data: bName } = await admin.from("studios").select("name").eq("id", studioB).single();
  check("owner A cannot rename studio B", bName.name === "Living Canvas Test B", renameError?.message);

  const { data: anonSees } = await anonClient.from("studios").select("id");
  check("signed-out caller sees no studios", (anonSees ?? []).length === 0);

  // ---------------------------------------------------------------- writes into another tenant

  console.log("\nCross-tenant writes");

  const { error: ownArtistError } = await a.client.from("artists").insert({
    studio_id: studioA,
    name: "Own artist",
    hourly_rate_pence: 12000,
    min_charge_pence: 8000,
  });
  check("owner A can add an artist to their own studio", !ownArtistError, ownArtistError?.message);

  const { error: foreignArtistError } = await a.client.from("artists").insert({
    studio_id: studioB,
    name: "Planted artist",
    hourly_rate_pence: 1,
    min_charge_pence: 1,
  });
  check("owner A cannot add an artist to studio B", Boolean(foreignArtistError));

  const { error: foreignBandError } = await a.client.from("price_bands").insert({
    studio_id: studioB,
    size_label: "Planted",
    hours_low: 1,
    hours_high: 2,
  });
  check("owner A cannot add a price band to studio B", Boolean(foreignBandError));

  // ---------------------------------------------------------------- nested policies

  console.log("\nNested policies (conversation, messages, enquiry, booking)");

  // Seed a full chain in studio B using the service role, then try to read it as A.
  const { data: artistB } = await admin
    .from("artists")
    .insert({
      studio_id: studioB,
      name: "B artist",
      hourly_rate_pence: 15000,
      min_charge_pence: 9000,
    })
    .select("id")
    .single();

  const { data: contactB } = await admin
    .from("contacts")
    .insert({ studio_id: studioB, name: "B client", channel: "web" })
    .select("id")
    .single();

  const { data: convB } = await admin
    .from("conversations")
    .insert({ studio_id: studioB, contact_id: contactB.id, channel: "web" })
    .select("id")
    .single();

  const { data: msgB } = await admin
    .from("messages")
    .insert({ conversation_id: convB.id, role: "client", content: "private" })
    .select("id")
    .single();

  const { data: enqB } = await admin
    .from("enquiries")
    .insert({ conversation_id: convB.id, intent: "new_tattoo", description: "private" })
    .select("id")
    .single();

  const { data: bookB } = await admin
    .from("bookings")
    .insert({
      enquiry_id: enqB.id,
      artist_id: artistB.id,
      type: "consultation",
      starts_at: new Date(stamp + 86400000).toISOString(),
      ends_at: new Date(stamp + 90000000).toISOString(),
    })
    .select("id")
    .single();

  const { data: aConvs } = await a.client.from("conversations").select("id").eq("id", convB.id);
  check("owner A cannot read studio B conversations", (aConvs ?? []).length === 0);

  const { data: aMsgs } = await a.client.from("messages").select("id").eq("id", msgB.id);
  check("owner A cannot read studio B messages", (aMsgs ?? []).length === 0);

  const { data: aEnq } = await a.client.from("enquiries").select("id").eq("id", enqB.id);
  check("owner A cannot read studio B enquiries", (aEnq ?? []).length === 0);

  const { data: aBook } = await a.client.from("bookings").select("id").eq("id", bookB.id);
  check("owner A cannot read studio B bookings", (aBook ?? []).length === 0);

  const { error: plantMsgError } = await a.client
    .from("messages")
    .insert({ conversation_id: convB.id, role: "assistant", content: "planted" });
  check("owner A cannot post into a studio B conversation", Boolean(plantMsgError));

  const { data: bMsgs } = await b.client.from("messages").select("id").eq("id", msgB.id);
  check("owner B can read their own messages", (bMsgs ?? []).length === 1);

  // ---------------------------------------------------------------- schema guardrails

  console.log("\nSchema constraints");

  const { error: negError } = await b.client.from("artists").insert({
    studio_id: studioB,
    name: "Negative",
    hourly_rate_pence: -1,
    min_charge_pence: 100,
  });
  check("negative rates are rejected", Boolean(negError));

  const { error: badBandError } = await b.client.from("price_bands").insert({
    studio_id: studioB,
    size_label: "Backwards",
    hours_low: 5,
    hours_high: 2,
  });
  check("a band ending before it starts is rejected", Boolean(badBandError));

  const { error: dupeError } = await b.client.from("price_bands").insert([
    { studio_id: studioB, size_label: "Palm", hours_low: 1, hours_high: 2 },
    { studio_id: studioB, size_label: "Palm", hours_low: 1, hours_high: 2 },
  ]);
  check("duplicate band names in one studio are rejected", Boolean(dupeError));

  const { error: badBookingError } = await b.client.from("bookings").insert({
    enquiry_id: enqB.id,
    artist_id: artistB.id,
    type: "session",
    starts_at: new Date(stamp + 90000000).toISOString(),
    ends_at: new Date(stamp + 86400000).toISOString(),
  });
  check("a booking ending before it starts is rejected", Boolean(badBookingError));

  // ---------------------------------------------------------------- erasure
  // Last, because it destroys studio B.

  console.log("\nErasure (UK GDPR)");

  const { error: foreignDeleteError } = await a.client.rpc("delete_studio", { target: studioB });
  const { data: stillThere } = await admin.from("studios").select("id").eq("id", studioB);
  check(
    "owner A cannot erase studio B",
    Boolean(foreignDeleteError) && stillThere.length === 1,
  );

  // Studio B has a booking, which is what made a plain cascade delete fail.
  const { error: selfDeleteError } = await b.client.rpc("delete_studio", { target: studioB });
  check("owner B can erase their own studio despite a booking", !selfDeleteError,
    selfDeleteError?.message);

  const { data: goneStudio } = await admin.from("studios").select("id").eq("id", studioB);
  check("the studio is gone", goneStudio.length === 0);

  const { data: goneBooking } = await admin.from("bookings").select("id").eq("id", bookB.id);
  check("its bookings went with it", goneBooking.length === 0);

  const { data: goneMessages } = await admin.from("messages").select("id").eq("id", msgB.id);
  check("its messages went with it", goneMessages.length === 0);
} catch (err) {
  console.error(`\nAborted: ${err.message}`);
  failures.push(err.message);
} finally {
  await cleanup(studioIds);
  console.log("\nCleaned up test studios and users.");
}

console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
