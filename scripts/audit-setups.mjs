/**
 * What would the assistant actually do for each business on the system?
 *
 *   node scripts/audit-setups.mjs
 *
 * Not "is the configuration valid" — every one of these is valid, and that is
 * the point. It asks which settings lead somewhere silently wrong: an
 * appointment length nobody chose, a widget switched off, a diary nothing can
 * read, an inbox that does not exist. None of it errors, none of it appears in
 * a log, and all of it is only visible to the customer.
 *
 * Worth running after taking a business on, and after anybody changes their
 * settings for them.
 *
 * One warning, learned the hard way while writing it: ask for a column that
 * does not exist and PostgREST rejects the entire query and hands back null,
 * which reads exactly like "this business has none of those". The first run of
 * this reported that both live businesses had no services at all. They had
 * twelve between them. Check spellings against the table before believing a
 * clean sheet.
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter(l => l.trim() && !l.startsWith("#"))
    .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: studios } = await db.from("studios").select("*").is("archived_at", null);

for (const s of studios) {
  const [{ data: bands }, { data: people }, { data: faqs }] = await Promise.all([
    db.from("price_bands").select("size_label, requires_consultation, duration_minutes, hours_low, hours_high").eq("studio_id", s.id),
    db.from("artists").select("name, active, booking_provider, hours").eq("studio_id", s.id),
    db.from("faqs").select("id").eq("studio_id", s.id).neq("answer", ""),
  ]);

  const active = (people ?? []).filter(p => p.active);
  const openDays = (s.hours ?? []).filter(h => !h.closed).length;
  const faults = [];

  // The one that bit Neat & Tidy: no services means bookingTypeFor gets
  // undefined, which means durationFor falls through to consultation_minutes
  // and every appointment is that long, whatever the job is.
  if (!bands?.length) {
    faults.push(
      `NO SERVICES — cannot quote, and every appointment would be booked as ` +
      `${s.consultation_minutes} minutes because that is what durationFor falls back to`,
    );
  }

  // A band that needs a consultation first is booked for consultation_minutes,
  // whatever the job is. That is right when somebody has set it deliberately
  // and absurd when it is still sitting at the default.
  const needsChat = (bands ?? []).filter(b => b.requires_consultation);
  if (needsChat.length && s.consultation_minutes <= 15) {
    faults.push(
      `${needsChat.map(b => b.size_label).join(", ")} require a consultation, and a ` +
      `consultation here is ${s.consultation_minutes} minutes — long enough for a phone ` +
      `call, not for looking at a job`,
    );
  }

  for (const b of bands ?? []) {
    if (b.duration_minutes != null && b.duration_minutes > s.max_session_minutes) {
      faults.push(`"${b.size_label}" is ${b.duration_minutes}m but max session is ${s.max_session_minutes}m — it would be booked short`);
    }
  }
  if (!active.length) faults.push("NOBODY TAKING BOOKINGS — cannot offer or book anything");
  if (!openDays) faults.push("NO OPENING HOURS — cannot offer a single time");
  if (!s.email) faults.push("NO EMAIL — customer replies and new-booking alerts reach nobody");
  if (!s.privacy_notice_url) faults.push("NO PRIVACY NOTICE — the widget links nowhere");
  if ((faqs ?? []).length === 0) faults.push("NO ANSWERED FAQS — everything goes to a human");
  if (s.widget_enabled === false) faults.push("WIDGET SWITCHED OFF — no button on their site");

  for (const p of active) {
    if (p.booking_provider !== "native") {
      faults.push(`${p.name}: diary provider is "${p.booking_provider}" — check it can be read`);
    }
  }

  // A notice period longer than the window searched leaves nothing to offer.
  if (s.notice_hours >= 21 * 24) {
    faults.push(`NOTICE ${s.notice_hours}h swallows the whole three-week search window`);
  }

  console.log("=".repeat(66));
  console.log(`${s.name}  (${s.vertical}, deposits: ${s.deposit_mode})`);
  console.log("  services: " + (bands ?? []).map(b => `${b.size_label} ${b.duration_minutes ?? Math.round(b.hours_low * 60) + "-" + Math.round(b.hours_high * 60)}m${b.requires_consultation ? " [consult first]" : ""}`).join("; "));
  console.log(`  services ${bands?.length ?? 0} | people ${active.length} | open days ${openDays} | consultation ${s.consultation_minutes}m | max session ${s.max_session_minutes}m | notice ${s.notice_hours}h`);
  if (!faults.length) console.log("  nothing silently wrong");
  for (const f of faults) console.log("  ✗ " + f);
}
