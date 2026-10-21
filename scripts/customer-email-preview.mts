/*
 * What a customer's email looks like, for each live business.
 *
 *   npx tsx scripts/customer-email-preview.mts
 *
 * Builds a confirmation and a receipt from each business's real settings,
 * their name, their photograph, their colour and their cancellation policy,
 * with made-up appointments in them. The settings are real because those are
 * what the layout has to survive: a pale orange that cannot take white
 * writing, a business with no photograph, a policy four paragraphs long.
 * The customers are invented, because nothing here needs a real one.
 *
 * Writes html beside itself. Sends nothing.
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import { composeConfirmation } from "../src/lib/messaging/confirmation.ts";
import { composeReceipt } from "../src/lib/messaging/receipt.ts";
import { usableAddress } from "../src/lib/messaging/address.ts";

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

const { data: studios, error } = await db
  .from("studios")
  .select("slug, name, email, timezone, cancellation_policy, widget_accent")
  .not("kind", "eq", "demo")
  .not("slug", "in", "(inside,help)")
  .is("archived_at", null)
  .order("name");
if (error) throw new Error(error.message);

/* Tomorrow at two, which is the appointment everybody pictures. */
const starts = new Date(Date.now() + 86_400_000);
starts.setUTCHours(14, 0, 0, 0);
const ends = new Date(starts.getTime() + 90 * 60_000);

for (const studio of studios ?? []) {
  const contactEmail = usableAddress(studio.email ?? "") ?? null;
  const accent = studio.widget_accent ?? null;

  const confirmation = composeConfirmation({
    startsAt: starts.toISOString(),
    endsAt: ends.toISOString(),
    type: "appointment",
    depositPence: 2500,
    contactName: "Marie Ellis",
    artistName: null,
    studioName: studio.name,
    timezone: studio.timezone ?? "Europe/London",
    cancellationPolicy: studio.cancellation_policy,
    bookingId: "preview",
    contactEmail,
    accent,
  });

  const receipt = composeReceipt({
    businessName: studio.name,
    amountPence: 8500,
    paidAt: new Date().toISOString(),
    timezone: studio.timezone ?? "Europe/London",
    kind: "payment",
    description: null,
    contactName: "Marie Ellis",
    reference: "8f3a21c9-4d5e-4f6a-b7c8-9d0e1f2a3b4c",
    items: [
      { name: "Appointment", quantity: 1, unitPence: 6000 },
      { name: "Aftercare kit", quantity: 1, unitPence: 2500 },
    ],
    vat: null,
    contactEmail,
    accent,
  });

  for (const [what, built] of [
    ["confirmation", confirmation],
    ["receipt", receipt],
  ] as const) {
    const to = new URL(`./customer-email-${studio.slug}-${what}.html`, import.meta.url);
    fs.writeFileSync(to, built.html, "utf8");
  }

  console.log(`${studio.name}  colour ${accent ?? "ours"}  reply to ${contactEmail ?? "nobody"}`);
}
