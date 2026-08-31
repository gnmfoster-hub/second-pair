/**
 * Where a reminder actually goes.
 *
 *   node scripts/test-reminders.mjs
 *
 * A reminder is sent the evening before an appointment, which is almost always
 * outside Meta's twenty-four hour window. So the interesting behaviour is not
 * "does it send" — it is which channel it picks when the obvious one is shut,
 * and whether it says so honestly when there is nowhere to go.
 *
 * Makes its own studio, books its own appointments, cleans up after itself.
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { routesFor } from "../src/lib/messaging/reach.ts";

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

const hoursAgo = (h) => new Date(Date.now() - h * 3600_000).toISOString();

/*
 * The routing decision on its own, against the shapes a reminder really meets.
 *
 * The delivery itself needs a Twilio account, so what is worth proving here is
 * the choice: given a conversation whose window has shut and a number on file,
 * does it fall back to the text rather than trying WhatsApp and failing?
 */
console.log("Which channel a reminder picks\n");

{
  const routes = routesFor({
    conversations: [
      { id: "c1", channel: "whatsapp", external_ref: "447700900111", last_inbound_at: hoursAgo(2) },
    ],
    phone: "447700900111",
    connected: ["whatsapp", "sms"],
  });
  check(
    "a customer who wrote this morning is reminded on WhatsApp",
    routes.find((r) => r.open)?.channel === "whatsapp",
  );
}

{
  const routes = routesFor({
    conversations: [
      { id: "c1", channel: "whatsapp", external_ref: "447700900111", last_inbound_at: hoursAgo(72) },
    ],
    phone: "447700900111",
    connected: ["whatsapp", "sms"],
  });
  const picked = routes.find((r) => r.open);
  check(
    "once the window shuts, it falls back to a text",
    picked?.channel === "sms",
    `picked ${picked?.channel ?? "nothing"}`,
  );
  check("and it does not try WhatsApp anyway", routes[0].channel === "sms");
}

{
  const routes = routesFor({
    conversations: [
      { id: "c1", channel: "whatsapp", external_ref: "447700900111", last_inbound_at: hoursAgo(72) },
    ],
    phone: null,
    connected: ["whatsapp", "sms"],
  });
  check(
    "with no number on file there is nowhere to fall back to",
    routes.every((r) => !r.open),
  );
}

{
  // A booking typed straight into the diary: no conversation at all.
  const routes = routesFor({
    conversations: [],
    phone: "447700900222",
    connected: ["sms"],
  });
  check(
    "a phone booking with no conversation is still reminded",
    routes.find((r) => r.open)?.channel === "sms",
  );
}

{
  const routes = routesFor({
    conversations: [
      { id: "c1", channel: "web", external_ref: "sess-1", last_inbound_at: hoursAgo(500) },
    ],
    phone: null,
    connected: [],
  });
  check(
    "a website enquiry is reminded in its own thread, however old",
    routes.find((r) => r.open)?.channel === "web",
  );
}

// ------------------------------------------------- the query, against the db
console.log("\nThe job itself");

const made = { studios: [] };
try {
  const { data: studio } = await admin
    .from("studios")
    .insert({ name: "Reminder Test", slug: `reminder-test-${Date.now()}` })
    .select("id, name, timezone")
    .single();
  made.studios.push(studio.id);

  const { data: artist } = await admin
    .from("artists")
    .insert({
      studio_id: studio.id,
      name: "Sarah Nolan",
      hourly_rate_pence: 5000,
      min_charge_pence: 2500,
    })
    .select("id")
    .single();

  const { data: contact } = await admin
    .from("contacts")
    .insert({ studio_id: studio.id, name: "Priya Raman", phone: "+447700900333" })
    .select("id")
    .single();

  const starts = new Date(Date.now() + 20 * 3600_000);
  const { data: booking, error: bookingError } = await admin
    .from("bookings")
    .insert({
      artist_id: artist.id,
      contact_id: contact.id,
      source: "manual",
      type: "session",
      category: "appointment",
      title: "Priya Raman — cut & finish",
      starts_at: starts.toISOString(),
      ends_at: new Date(starts.getTime() + 3600_000).toISOString(),
      blocks_availability: true,
      deposit_status: "paid",
    })
    .select("id")
    .single();
  check("a phone booking can be made", !bookingError, bookingError?.message);

  const { data: template } = await admin
    .from("reminder_templates")
    .insert({
      studio_id: studio.id,
      label: "The day before",
      hours_before: 24,
      body: "Hi {name}, just a reminder you are booked in {when} with {practitioner}.",
    })
    .select("id")
    .single();

  const { error: dueError } = await admin.from("reminders").insert({
    booking_id: booking.id,
    template_id: template.id,
    due_at: new Date(Date.now() - 60_000).toISOString(),
    status: "pending",
  });
  check("a reminder can be scheduled and made due", !dueError, dueError?.message);

  /*
   * The query the job runs, exactly as it runs it.
   *
   * This is the part worth testing against a real database: it is deeply
   * nested, and a nested select that PostgREST cannot resolve fails at run
   * time with types that looked perfectly fine.
   */
  const { data: rows, error: queryError } = await admin
    .from("reminders")
    .select(
      "id, due_at, template_id, " +
        "bookings!inner(id, starts_at, cancelled_at, " +
        "artists!inner(name, studio_id), contacts(name, phone, email), " +
        "enquiries(conversations(id, channel, external_ref, last_inbound_at, " +
        "ai_paused, contacts(name, phone, email))))",
    )
    .eq("status", "pending")
    .lte("due_at", new Date().toISOString())
    .limit(200);

  check("the job's query runs", !queryError, queryError?.message);

  const mine = (rows ?? []).filter((r) => r.bookings?.artists?.studio_id === studio.id);
  check("it finds the due reminder", mine.length === 1, `found ${mine.length}`);

  const row = mine[0];
  check("it reaches the person through the booking", row?.bookings?.contacts?.name === "Priya Raman");
  check("with a number to text", row?.bookings?.contacts?.phone === "+447700900333");
  check("and the appointment it is about", Boolean(row?.bookings?.starts_at));
} catch (error) {
  console.error(`\nAborted: ${error.message}`);
  failures.push(error.message);
} finally {
  for (const id of made.studios) {
    const { data: team } = await admin.from("artists").select("id").eq("studio_id", id);
    if (team?.length) {
      await admin.from("bookings").delete().in("artist_id", team.map((a) => a.id));
    }
    await admin.from("studios").delete().eq("id", id);
  }
  console.log("\nCleaned up.");
}

console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
