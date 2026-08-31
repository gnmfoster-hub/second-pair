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

const { verticalPack } = await import("../src/lib/verticals.ts");
const pack = verticalPack("dog_groomer");

const hours = [
  { day: 0, open: "09:00", close: "17:00", closed: true },
  ...[1, 2, 3, 4, 5].map((day) => ({ day, open: "09:00", close: "17:00", closed: false })),
  { day: 6, open: "09:00", close: "14:00", closed: false },
];

async function makeGroomer(name, personality) {
  const { groomer, ...studioFields } = personality;
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + Date.now().toString(36);
  const { data: s, error: insertError } = await db
    .from("studios")
    .insert({
      name,
      slug,
      vertical: "dog_groomer",
      vocabulary: pack.vocabulary,
      deposit_mode: "none",
      privacy_notice_url: "https://example.test/privacy",
      hours,
      ...studioFields,
    })
    .select("id")
    .single();
  if (insertError) throw new Error(name + ": " + insertError.message);

  await db.from("artists").insert({
    studio_id: s.id,
    name: groomer,
    handle: "me",
    hourly_rate_pence: 4000,
    min_charge_pence: 2500,
    active: true,
    booking_provider: "native",
    styles: [],
  });

  await db.from("service_options").insert(
    [
      ...pack.styles.map((x, i) => ({ kind: "style", value: x.value, label: x.label, sort_order: i })),
      ...pack.intents.map((x, i) => ({ kind: "intent", value: x.value, label: x.label, sort_order: i })),
    ].map((o) => ({ ...o, studio_id: s.id })),
  );
  await db
    .from("price_bands")
    .insert(pack.bands.map((b, i) => ({ ...b, studio_id: s.id, sort_order: i })));

  return slug;
}

const posh = await makeGroomer("Wagtails Grooming Studio", {
  groomer: "Camilla",
  tone: "Polished and precise. Full sentences. Never slang.",
  always_mention: ["We are fully insured and City & Guilds qualified", "Every groom includes a spritz of our own cologne"],
  never_mention: ["Never say 'doggy'", "Never use exclamation marks"],
  voice_examples: [
    {
      ask: "do you do doodles?",
      reply:
        "We do, yes. Doodle coats vary enormously, so I would want to see him before quoting properly. Would you like to bring him in for a look first?",
    },
  ],
});

const salt = await makeGroomer("Muddy Paws", {
  groomer: "Kaz",
  tone: "Dead casual, like texting a mate. Short. Lots of warmth.",
  always_mention: ["We're dog-led, no force, no muzzles", "Park right outside, plenty of room"],
  never_mention: ["Never sound corporate", "Never say 'kindly'"],
  voice_examples: [
    {
      ask: "do you do doodles?",
      reply: "Ha, do we ever — half my week is doodles. What's yours like coat-wise, matted at all? Send us a pic if you've got one x",
    },
  ],
});

const ask = async (tag, slug, message) => {
  const session = (tag.replace(/[^A-Za-z0-9]/g, "") + Date.now() + "xxxxxxxxxxxxxxxxxxxx").slice(0, 24);
  const r = await fetch("http://localhost:3000/api/widget/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ studio: slug, session, message }),
  });
  const d = await r.json();
  console.log("  [" + tag + "] " + (d.reply ?? d.error ?? "").replace(/\n/g, "\n         "));
  console.log();
};

const question = "hiya, got a cockapoo needs doing, hes a bit of a state tbh. how much?";
console.log("Same question to two dog groomers:\n");
console.log("  client: " + question + "\n");
await ask("Wagtails", posh, question);
await ask("Muddy Paws", salt, question);
