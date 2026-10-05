/*
 * Amber's dog walking client form, as a form she can send.
 *
 *   node scripts/amber-walking-form.mjs          what it would do
 *   node scripts/amber-walking-form.mjs --write  do it
 *
 * Built from Ambers_Paws_and_Pastures_Dog_Walking_Client_Form.pdf, which is
 * four pages of boxes somebody has to print, fill in with a pen, photograph and
 * send back. Same ten sections, same wording where the wording is hers, in the
 * order she wrote them.
 *
 * ── What the roles are doing ───────────────────────────────────────────────
 *
 * Eight of these questions are things Second Pair already holds or already acts
 * on, and those carry a role so the answer goes somewhere rather than into a
 * blob. The owner's details fill themselves in and update the record. The
 * vaccination expiry lands on the fact that refuses a booking once it has
 * passed. The breed shows on the appointment. Off-lead permission lands on
 * recall. Behaviour worth knowing lands on the alert, which shows wherever that
 * client appears rather than on page two of a form nobody reopens.
 *
 * ── Two deliberate changes from the paper ──────────────────────────────────
 *
 * Vaccinations were a tick: up to date, due, or other. A tick cannot stop a
 * booking or chase anybody, so it is the expiry date instead. That is the one
 * change to her wording and it is the one worth having.
 *
 * And the paper has one dog on it. Most of her clients have one, some have
 * three, so the dog section repeats rather than making somebody fill the owner
 * section out three times.
 *
 * Idempotent: run twice and the second run updates rather than adding a second.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const REPO = path.join(process.env.USERPROFILE, "Desktop", "inkdesk");
const envFile = path.join(REPO, ".env.local");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const at = t.indexOf("=");
    if (at < 1) continue;
    const k = t.slice(0, at).trim();
    if (process.env[k] === undefined) process.env[k] = t.slice(at + 1).trim();
  }
}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const write = process.argv.includes("--write");

const NAME = "Dog walking: client and dog information";

/** A paragraph the customer reads. */
const says = (id, label) => ({ id, type: "text", label });
/** A heading, which is a paragraph that happens to be short. */
const part = (id, label) => ({ id, type: "text", label });

const blocks = [
  says(
    "intro",
    "Please fill this in before your dog's first walk. It tells us how to look after them properly, " +
      "and it only takes a few minutes. Anything you are not sure about, leave blank and we will go through it together.",
  ),

  /* 1. Owner, which we mostly already know. */
  part("p_owner", "About you"),
  { id: "o_name", type: "short", label: "Your full name", required: true, role: "name" },
  { id: "o_addr", type: "long", label: "Address", required: true, role: "address" },
  { id: "o_post", type: "short", label: "Postcode", required: true, role: "postcode" },
  { id: "o_tel", type: "short", label: "Mobile number", required: true, role: "phone" },
  {
    id: "o_email",
    type: "short",
    label: "Email address",
    help: "So we can send you a copy of this form, and anything about your walks.",
    required: true,
    role: "email",
  },
  { id: "o_emg", type: "short", label: "Emergency contact and number", required: true },

  /*
   * 2. The dog, or dogs.
   *
   * The paper has one. Plenty of her clients have two or three, and filling the
   * owner section out three times is how a form gets abandoned halfway. The
   * group repeats; the second dog's breed is kept as breed_2 so it cannot
   * overwrite the first.
   */
  part("p_dog", "Your dog"),
  {
    id: "dog",
    type: "repeat",
    label: "Your dog",
    each: "Dog",
    addLabel: "Add another dog",
    children: [
      { id: "d_name", type: "short", label: "Dog's name", required: true },
      { id: "d_breed", type: "short", label: "Breed or cross", required: true, role: "fact:breed" },
      { id: "d_age", type: "short", label: "Age or date of birth" },
      {
        id: "d_sex",
        type: "choice",
        label: "Sex",
        options: ["Male, neutered", "Male, entire", "Female, spayed", "Female, entire"],
      },
      { id: "d_marks", type: "short", label: "Colour and any identifying markings" },
      { id: "d_chip", type: "short", label: "Microchip number" },
      {
        id: "d_vacc",
        type: "date",
        label: "When do their vaccinations run out?",
        help: "On the card from your vet. We will remind you before it does.",
        required: true,
        role: "fact:vaccination_due",
      },
      {
        id: "d_watch",
        type: "yesno",
        label: "Anything we must know about this one",
        help: "Biting, escaping, guarding food, chasing livestock, anything that has happened before.",
        detailOnYes: true,
        required: true,
        role: "alert",
      },
      {
        id: "d_lead",
        type: "yesno",
        label: "May we let this one off the lead?",
        required: true,
        role: "fact:recall",
      },
    ],
  },

  /* 3. Vet and health. */
  part("p_vet", "Vet and health"),
  { id: "v_prac", type: "short", label: "Vet practice and telephone", required: true },
  { id: "v_flea", type: "choice", label: "Flea and tick treatment", options: ["Up to date", "Not current", "I am not sure"] },
  { id: "v_worm", type: "choice", label: "Worming treatment", options: ["Up to date", "Not current", "I am not sure"] },
  { id: "v_meds", type: "long", label: "Medication and instructions" },
  { id: "v_hist", type: "long", label: "Previous injuries or operations" },

  /* 4. Temperament. */
  part("p_behave", "How they are with people and other dogs"),
  says(
    "b_why",
    "Please be straight with us about this. Nothing here will stop us walking your dog. " +
      "It tells us how to keep them, and everybody else, safe.",
  ),
  { id: "b_other", type: "long", label: "Anything else about how they behave", role: "note" },

  /* 5. Walking. */
  part("p_walk", "Their walks"),
  {
    id: "w_kind",
    type: "choice",
    label: "What suits them",
    options: ["Group walks", "Solo walks", "Either is fine"],
    required: true,
  },
  {
    id: "w_len",
    type: "choice",
    label: "How long",
    options: ["20 minutes", "30 minutes", "45 minutes", "60 minutes", "Something else"],
  },
  { id: "w_when", type: "short", label: "Days and times that suit you" },
  { id: "w_kit", type: "short", label: "What they wear", help: "Collar, harness, lead, long line, muzzle." },
  { id: "w_pace", type: "choice", label: "Pace", options: ["High energy", "Normal", "Slow and gentle", "Toilet break only"] },
  { id: "w_treat", type: "choice", label: "Treats", options: ["Yes", "No", "Only ones I supply"] },
  { id: "w_food", type: "short", label: "Anything they must not have" },

  /* 6. Off lead. */
  part("p_lead", "Off the lead"),
  says(
    "l_why",
    "Off-lead exercise only ever happens where we have agreed it and where it is safe on the day. " +
      "Even where you say yes, we will keep them on a lead if we are not happy.",
  ),
  /*
   * Whether each dog may be off the lead is asked per dog, up in the group,
   * because it is the dog's answer and not the household's. What is left here
   * is where, and what word brings them back.
   */
  {
    id: "l_where",
    type: "choice",
    label: "If yes, where?",
    options: ["Anywhere we judge safe", "Only in a secure enclosed area"],
  },
  { id: "l_word", type: "short", label: "What word do you use to call them back?" },
  { id: "l_note", type: "long", label: "Anything else about their recall" },

  /* 7. Getting in. */
  part("p_access", "Collecting and dropping off"),
  { id: "a_addr", type: "long", label: "Where should we collect them from?", help: "If it is not the address above." },
  { id: "a_back", type: "short", label: "Where should we put them when we bring them back?" },
  {
    id: "a_key",
    type: "choice",
    label: "How do we get in?",
    options: ["You will be home", "Key", "Lockbox", "Something else"],
    required: true,
  },
  { id: "a_alarm", type: "long", label: "Alarm, gate or access instructions", role: "note" },
  { id: "a_pets", type: "short", label: "Other pets or people at the property" },

  /* 8. Emergency. */
  part("p_emg", "If something goes wrong"),
  says(
    "e_text",
    "If we cannot reach you in an emergency, you are authorising us to do what is reasonable to look after your dog, " +
      "including contacting the person below and taking them to a vet. Veterinary costs are yours.",
  ),
  { id: "e_alt", type: "short", label: "Another contact and number", help: "Somebody else we can try." },
  { id: "e_vet", type: "short", label: "Which vet would you want us to use?" },
  { id: "e_ok", type: "agree", label: "I authorise this, and I understand the vet's bill is mine.", required: true },

  /* 9. The promises. */
  part("p_agree", "A few things to confirm"),
  { id: "c_true", type: "agree", label: "Everything I have put here is accurate and complete.", required: true },
  { id: "c_tell", type: "agree", label: "I will tell you if my dog's health or behaviour changes.", required: true },
  { id: "c_stop", type: "agree", label: "I understand a walk may be changed or stopped if safety is a concern.", required: true },
  {
    id: "c_photo",
    type: "yesno",
    label: "May we take photographs of your dog?",
    help: "For your care records, and only on your social media if you say yes separately.",
    required: true,
  },
  { id: "c_any", type: "long", label: "Anything else you would like us to know", role: "note" },

  /* 10. Signing. */
  says(
    "s_text",
    "By signing you confirm you have read this form, that what you have told us is accurate, and that you will let us know " +
      "if anything changes. It sits alongside our terms and conditions.",
  ),
  { id: "sign", type: "signature", label: "Signature", required: true },
];

(async () => {
  const { data: studio } = await db
    .from("studios")
    .select("id, name, slug")
    .ilike("slug", "%amber%")
    .maybeSingle();

  if (!studio) {
    console.log("Amber's is not on this database.");
    process.exit(0);
  }

  const flat = blocks.flatMap((b) => (b.type === "repeat" ? [b, ...(b.children ?? [])] : [b]));
  const counts = flat.reduce((at, b) => ({ ...at, [b.type]: (at[b.type] ?? 0) + 1 }), {});
  const roles = flat.filter((b) => b.role);

  console.log(`\n${studio.name}`);
  console.log(`  "${NAME}"`);
  console.log(`  ${flat.length} questions, ${blocks.filter((b) => b.type === "repeat").length} of them repeating:`, JSON.stringify(counts));
  console.log(`  ${roles.length} of them fill in or write back:`);
  for (const b of roles) console.log(`     ${b.role.padEnd(22)} ${b.label}`);

  if (!write) {
    console.log("\n  Nothing written. Run with --write to save it.\n");
    process.exit(0);
  }

  const { data: already } = await db
    .from("form_templates")
    .select("id")
    .eq("studio_id", studio.id)
    .eq("name", NAME)
    .maybeSingle();

  if (already) {
    const { error } = await db
      .from("form_templates")
      .update({ blocks, kind: "questionnaire", active: true, updated_at: new Date().toISOString() })
      .eq("id", already.id);
    if (error) throw new Error(error.message);
    console.log(`\n  Updated the one that was already there.\n`);
  } else {
    const { error } = await db.from("form_templates").insert({
      studio_id: studio.id,
      name: NAME,
      kind: "questionnaire",
      blocks,
      active: true,
    });
    if (error) throw new Error(error.message);
    console.log(`\n  Added.\n`);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
