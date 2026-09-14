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

  // ------------------------------------------------------ the manual diary
  //
  // Regression for a real one. The bookings policy used to reach a row only
  // through its enquiry, so anything the owner put in the diary by hand — a
  // block, a day off, a delivery, a dentist appointment — had no enquiry, and
  // was therefore invisible to them and impossible to create.
  //
  // Ownership now runs through the artist, which every booking has.

  const manualStart = new Date(stamp + 200000000).toISOString();
  const { data: manual, error: manualError } = await b.client
    .from("bookings")
    .insert({
      artist_id: artistB.id,
      type: "session",
      source: "manual",
      category: "personal",
      title: "Dentist",
      starts_at: manualStart,
      ends_at: new Date(stamp + 203600000).toISOString(),
    })
    .select("id")
    .single();

  check(
    "owner B can put something in their own diary by hand",
    !manualError && Boolean(manual?.id),
    manualError?.message,
  );

  if (manual?.id) {
    const { data: readBack } = await b.client
      .from("bookings")
      .select("id, title")
      .eq("id", manual.id);
    check(
      "and can read it back afterwards",
      (readBack ?? []).length === 1 && readBack[0].title === "Dentist",
    );

    const { data: peek } = await a.client.from("bookings").select("id").eq("id", manual.id);
    check("owner A cannot see it", (peek ?? []).length === 0);

    const { error: stealError } = await a.client
      .from("bookings")
      .update({ title: "Moved by a stranger" })
      .eq("id", manual.id);
    const { data: afterSteal } = await admin
      .from("bookings")
      .select("title")
      .eq("id", manual.id)
      .single();
    check(
      "owner A cannot move it",
      Boolean(stealError) || afterSteal?.title === "Dentist",
    );
  }

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

  // ------------------------------------------------- managed by the owner

  console.log("\nA person the business looks after");

  /*
   * The switch that decides whether somebody sets their own prices exists in
   * three places: the screen hides the form, the action returns a sentence,
   * and the policy refuses the write. Only the third is a permission — the
   * other two are politeness — and the policy is the one nothing else could
   * check, because migrations only prove columns exist.
   *
   * It has to be a member of staff and not the owner, which the first version
   * of this test got wrong. Policies are OR'd, so an owner who is also managed
   * still passes the owner's own policy and writes anything in their studio —
   * which is correct behaviour and a useless test. An owner managing
   * themselves is nonsense; the case that matters is an employee.
   */
  const c = await makeUser("c");
  await admin.from("studio_members").insert({ studio_id: studioB, user_id: c.id, role: "staff" });

  const { data: employed } = await admin
    .from("artists")
    .insert({
      studio_id: studioB,
      name: "Employed stylist",
      user_id: c.id,
      owner_managed: true,
      hourly_rate_pence: 4000,
      min_charge_pence: 2000,
    })
    .select("id")
    .single();

  const { data: shopService } = await admin
    .from("services")
    .insert({
      studio_id: studioB,
      name: "Cut",
      kind: "service",
      minutes: 30,
      price_pence: 3000,
    })
    .select("id")
    .single();

  const { error: priceError } = await c.client
    .from("service_people")
    .insert({ service_id: shopService.id, artist_id: employed.id, price_pence: 9999 });
  check("a managed person cannot set their own price", Boolean(priceError), "the write was accepted");

  const { error: ownServiceError } = await c.client.from("services").insert({
    studio_id: studioB,
    artist_id: employed.id,
    name: "Something only I do",
    kind: "service",
    minutes: 30,
    price_pence: 1000,
  });
  check("a managed person cannot add their own service", Boolean(ownServiceError),
    "the write was accepted");

  const { error: ownReminderError } = await c.client.from("reminder_templates").insert({
    studio_id: studioB,
    artist_id: employed.id,
    label: "Mine",
    hours_before: 24,
    body: "see you tomorrow",
  });
  check("a managed person cannot write their own reminders", Boolean(ownReminderError),
    "the write was accepted");

  /*
   * And the other half, which matters just as much: switching it off has to
   * give the settings back. A permission that cannot be undone is a trap.
   */
  await admin.from("artists").update({ owner_managed: false }).eq("id", employed.id);

  const { error: nowAllowed } = await c.client
    .from("service_people")
    .insert({ service_id: shopService.id, artist_id: employed.id, price_pence: 4500 });
  check("switching it off gives their own prices back", !nowAllowed, nowAllowed?.message);

  /* And they still cannot touch a colleague's, managed or not. */
  const { data: colleague } = await admin
    .from("artists")
    .insert({ studio_id: studioB, name: "Somebody else", hourly_rate_pence: 5000, min_charge_pence: 2000 })
    .select("id")
    .single();

  const { error: colleagueError } = await c.client
    .from("service_people")
    .insert({ service_id: shopService.id, artist_id: colleague.id, price_pence: 1 });
  check("a person cannot set a colleague's price", Boolean(colleagueError), "the write was accepted");

  // ---------------------------------------------------------------- counter sales

  /*
   * Selling a bottle at the desk.
   *
   * payments is owner-only to write apart from one deliberate hole: staff may
   * insert, because a sale is made by whoever is stood at the desk, and a shop
   * that has to route every bottle through the owner keeps a paper pad
   * instead. The hole is meant to be exactly that shape — insert, their own
   * takings, nothing else — and a policy is the only thing that enforces it.
   * The screen and the action are politeness.
   *
   * Every check below runs as the employee, never the owner. Policies are
   * OR'd, so an owner passes their own policy and would make all of this look
   * like it works while none of it had been exercised. That is the mistake the
   * managed-person test above was written wrong the first time.
   */
  console.log("\nCounter sales");

  const { data: ownSale, error: ownSaleError } = await c.client
    .from("payments")
    .insert({
      studio_id: studioB,
      artist_id: employed.id,
      kind: "product",
      gross_pence: 1450,
      status: "paid",
      description: "Shampoo, 250ml",
      paid_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  check("a member of staff can record their own sale", !ownSaleError && Boolean(ownSale),
    ownSaleError?.message);

  const { error: itemError } = await c.client.from("payment_items").insert({
    payment_id: ownSale?.id,
    name: "Shampoo, 250ml",
    quantity: 1,
    unit_pence: 1450,
  });
  check("and what was in it", !itemError, itemError?.message);

  /*
   * The check that stops a sale going in under somebody else's name. On the
   * per-person model that is not an accounting slip — it is money in another
   * person's takings, and on their tax return.
   */
  const { error: theirsError } = await c.client.from("payments").insert({
    studio_id: studioB,
    artist_id: colleague.id,
    kind: "product",
    gross_pence: 9900,
    status: "paid",
  });
  check("but not one in a colleague's name", Boolean(theirsError), "the write was accepted");

  /* Insert and only insert: a mistake is undone by a refund, not a rewrite. */
  const { data: afterEdit } = await c.client
    .from("payments")
    .update({ gross_pence: 1 })
    .eq("id", ownSale?.id)
    .select("id");
  check("a member of staff cannot rewrite a payment", (afterEdit ?? []).length === 0,
    "the update was accepted");

  const { data: afterDelete } = await c.client
    .from("payments")
    .delete()
    .eq("id", ownSale?.id)
    .select("id");
  check("nor delete one", (afterDelete ?? []).length === 0, "the delete was accepted");

  const { data: saleAfter } = await admin
    .from("payments")
    .select("gross_pence")
    .eq("id", ownSale?.id)
    .maybeSingle();
  check("and the sale is untouched at the end of it", saleAfter?.gross_pence === 1450,
    `it now reads ${saleAfter?.gross_pence}`);

  /* And the wall that matters most: another business cannot record into this one. */
  const { error: crossSaleError } = await a.client.from("payments").insert({
    studio_id: studioB,
    kind: "product",
    gross_pence: 100,
    status: "paid",
  });
  check("another studio's owner cannot record a sale here", Boolean(crossSaleError),
    "the write was accepted");

  // ---------------------------------------------------- a table with no door

  console.log("");
  console.log("Tables no browser session may touch");

  /*
   * product_interest holds real people's email addresses — strangers who asked
   * to be told when something of ours is ready — and it is ours rather than
   * any business's. It is protected by having row-level security on and not a
   * single policy, which means no session can reach it however it asks.
   *
   * That arrangement is invisible and one migration away from being undone: a
   * permissive policy added by somebody tidying up would open it silently, and
   * nothing anywhere would notice. So it is checked, and the check is the only
   * thing standing between that and a list of addresses somebody can read.
   */
  const { data: seeded } = await admin
    .from("product_interest")
    .insert({ product: `rls-test-${stamp}`, email: `rls-${stamp}@inkdesk.test` })
    .select("id")
    .maybeSingle();

  const { data: peeked } = await a.client
    .from("product_interest")
    .select("id, email")
    .eq("id", seeded?.id ?? "00000000-0000-0000-0000-000000000000");

  check("a signed-in user cannot read the early-access list", (peeked ?? []).length === 0,
    "the row came back");

  const { error: pushedError } = await a.client
    .from("product_interest")
    .insert({ product: "sneaked", email: `sneak-${stamp}@inkdesk.test` });

  check("nor add anybody to it", Boolean(pushedError), "the write was accepted");

  if (seeded?.id) await admin.from("product_interest").delete().eq("id", seeded.id);

  // -------------------------------------------- the newer tenant-scoped ones

  console.log("");
  console.log("Channels and arrangements");

  /*
   * A channel connection carries the number customers text and what it takes
   * to answer on it. Somebody else's is the one row on the platform whose
   * leaking would let another business read a salon's incoming messages.
   */
  const { data: chanB, error: chanSeedError } = await admin
    .from("channel_connections")
    .insert({
      studio_id: studioB,
      channel: "sms",
      external_id: `+4477009${stamp % 100000}`,
      label: "07700 900000",
    })
    .select("id")
    .maybeSingle();

  /*
   * Said out loud rather than skipped.
   *
   * The first version of this used a column name that does not exist, the
   * insert failed, and the two checks below simply did not run — no failure,
   * no mention, and a tally that went up by four instead of six. A test that
   * quietly does not happen is worse than one that fails, because the number
   * at the bottom still says everything is fine.
   */
  if (!chanB?.id) {
    check("a channel could be set up to test against", false, chanSeedError?.message ?? "no row");
  }

  if (chanB?.id) {
    const { data: chanPeek } = await a.client
      .from("channel_connections")
      .select("id, external_ref")
      .eq("id", chanB.id);

    check("owner A cannot read studio B's channels", (chanPeek ?? []).length === 0,
      "the connection came back");

    const { data: chanMoved } = await a.client
      .from("channel_connections")
      .update({ active: false })
      .eq("id", chanB.id)
      .select("id");

    check("nor switch one off", (chanMoved ?? []).length === 0, "the update was accepted");
  }

  /*
   * And a booking group — a wedding party, a landlord's two flats. Newer than
   * every test above it, and the name on it is a customer's.
   */
  const { data: groupB, error: groupSeedError } = await admin
    .from("booking_groups")
    .insert({ studio_id: studioB, name: `Wedding ${stamp}` })
    .select("id")
    .maybeSingle();

  if (!groupB?.id) {
    check("an arrangement could be set up to test against", false, groupSeedError?.message ?? "no row");
  }

  if (groupB?.id) {
    const { data: groupPeek } = await a.client
      .from("booking_groups")
      .select("id, name")
      .eq("id", groupB.id);

    check("owner A cannot read studio B's arrangements", (groupPeek ?? []).length === 0,
      "the group came back");

    const { error: groupWriteError } = await a.client
      .from("booking_groups")
      .insert({ studio_id: studioB, name: "not mine" });

    check("nor start one there", Boolean(groupWriteError), "the write was accepted");
  }

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
