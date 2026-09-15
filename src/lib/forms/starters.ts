import type { Block } from "./blocks.ts";

/**
 * Forms a business can start from, by trade.
 *
 * A blank form builder is a job nobody gets round to. A tattoo studio that
 * opens this page and finds a consent form with the questions every studio
 * asks is sending it to somebody the same afternoon. Every starter is plain
 * wording the business edits to fit — the note at the top of each says so,
 * because none of this is legal or medical advice and the product must not
 * pretend it is.
 */

export type Starter = {
  key: string;
  name: string;
  kind: "consent" | "questionnaire" | "waiver" | "quote" | "other";
  /** One line on the picker. */
  blurb: string;
  blocks: Block[];
};

const CHECK_WORDING: Block = {
  id: "check",
  type: "text",
  label:
    "Please read this form carefully and answer honestly. Your answers are kept privately with your record and only used to look after you.",
};

const sig: Block = { id: "sign", type: "signature", label: "Signature", required: true };

const dob: Block = { id: "dob", type: "date", label: "Date of birth", required: true };

const medical = (id: string, label: string, help?: string): Block => ({
  id,
  type: "yesno",
  label,
  help,
  required: true,
  detailOnYes: true,
});

const STARTERS: Record<string, Starter> = {
  tattoo_consent: {
    key: "tattoo_consent",
    name: "Tattoo consent",
    kind: "consent",
    blurb: "Age, health questions, design checked and aftercare agreed.",
    blocks: [
      CHECK_WORDING,
      dob,
      { id: "over18", type: "agree", label: "I confirm I am 18 or over and can show photo ID.", required: true },
      medical("conditions", "Do you have any medical conditions? (for example diabetes, epilepsy, a heart condition, a blood disorder, a skin condition)"),
      medical("blood", "Are you taking blood thinners or any medication that affects healing?"),
      medical("allergies", "Do you have any allergies? (for example latex, plasters, pigments)"),
      { id: "pregnant", type: "yesno", label: "Are you pregnant or breastfeeding?", required: true },
      { id: "alcohol", type: "yesno", label: "Have you had alcohol or drugs in the last 24 hours?", required: true },
      { id: "design", type: "agree", label: "I have checked the design, size, spelling and placement, and I am happy with them.", required: true },
      { id: "aftercare", type: "agree", label: "I have been given aftercare instructions and will follow them. Healing is my responsibility once I leave.", required: true },
      sig,
    ],
  },
  aftercare: {
    key: "aftercare",
    name: "Aftercare acknowledgement",
    kind: "consent",
    blurb: "Confirms they were given aftercare advice.",
    blocks: [
      { id: "info", type: "text", label: "Edit this paragraph with your own aftercare instructions." },
      { id: "read", type: "agree", label: "I have read and understood the aftercare instructions.", required: true },
      sig,
    ],
  },
  patch_test: {
    key: "patch_test",
    name: "Patch test and colour consent",
    kind: "consent",
    blurb: "Records the patch test and any reaction before colour.",
    blocks: [
      CHECK_WORDING,
      { id: "tested", type: "date", label: "Date of patch test", required: true },
      medical("reaction", "Have you ever had a reaction to hair dye, a patch test, or a black henna tattoo?"),
      medical("since", "Since your patch test, have you noticed any itching, redness or swelling?"),
      medical("scalp", "Do you have any scalp conditions, cuts or sensitivity?"),
      { id: "understand", type: "agree", label: "I understand a patch test is needed at least 48 hours before colour, and that I must tell the salon of any reaction.", required: true },
      sig,
    ],
  },
  beauty_consultation: {
    key: "beauty_consultation",
    name: "Treatment consultation",
    kind: "questionnaire",
    blurb: "Allergies, skin, pregnancy and medical history before a treatment.",
    blocks: [
      CHECK_WORDING,
      dob,
      medical("allergies", "Do you have any allergies or sensitivities? (for example adhesives, latex, fragrance)"),
      medical("skin", "Do you have any skin conditions in the area being treated?"),
      medical("conditions", "Do you have any medical conditions or take any medication?"),
      { id: "pregnant", type: "yesno", label: "Are you pregnant or breastfeeding?", required: true },
      { id: "lenses", type: "yesno", label: "Do you wear contact lenses?", help: "Only relevant for eye and lash treatments." },
      { id: "consent", type: "agree", label: "I have answered honestly and will tell you if anything changes.", required: true },
      sig,
    ],
  },
  aesthetics_medical: {
    key: "aesthetics_medical",
    name: "Medical questionnaire",
    kind: "questionnaire",
    blurb: "Full medical history before an aesthetic treatment.",
    blocks: [
      CHECK_WORDING,
      dob,
      { id: "over18", type: "agree", label: "I confirm I am 18 or over.", required: true },
      medical("conditions", "Do you have any medical conditions? (for example autoimmune, bleeding disorders, neuromuscular conditions)"),
      medical("meds", "Are you taking any medication, supplements or blood thinners?"),
      medical("allergies", "Do you have any allergies?"),
      { id: "pregnant", type: "yesno", label: "Are you pregnant, trying to conceive or breastfeeding?", required: true },
      medical("previous", "Have you had any aesthetic treatments in the last 12 months?"),
      medical("coldsores", "Do you get cold sores or have an infection in the treatment area?"),
      { id: "results", type: "agree", label: "I understand results vary, and the risks and aftercare have been explained to me.", required: true },
      sig,
    ],
  },
  health_questionnaire: {
    key: "health_questionnaire",
    name: "Health questionnaire",
    kind: "questionnaire",
    blurb: "Pre-exercise and treatment health check (PAR-Q style).",
    blocks: [
      CHECK_WORDING,
      dob,
      { id: "heart", type: "yesno", label: "Has a doctor ever said you have a heart condition, or that you should only exercise under supervision?", required: true, detailOnYes: true },
      { id: "chest", type: "yesno", label: "Do you get chest pain when active, or have you had chest pain in the last month?", required: true, detailOnYes: true },
      { id: "dizzy", type: "yesno", label: "Do you lose your balance from dizziness, or have you ever lost consciousness?", required: true, detailOnYes: true },
      { id: "joints", type: "yesno", label: "Do you have a bone, joint or muscle problem that could be made worse by activity or treatment?", required: true, detailOnYes: true },
      { id: "bp", type: "yesno", label: "Are you taking medication for blood pressure or a heart condition?", required: true, detailOnYes: true },
      { id: "other", type: "yesno", label: "Is there any other reason you should not take part?", required: true, detailOnYes: true },
      { id: "gp", type: "short", label: "GP surgery (optional)" },
      { id: "honest", type: "agree", label: "I have answered honestly and will tell you if my health changes.", required: true },
      sig,
    ],
  },
  therapy_agreement: {
    key: "therapy_agreement",
    name: "Working agreement",
    kind: "consent",
    blurb: "Confidentiality, its limits, cancellations and an emergency contact.",
    blocks: [
      { id: "confidential", type: "text", label: "What you share is kept confidential. The limits are where there is a serious risk of harm to you or somebody else, or where the law requires it. Edit this to match your own agreement." },
      { id: "cancel", type: "text", label: "Sessions cancelled with less than 48 hours' notice may be charged. Edit to match your policy." },
      { id: "contact_name", type: "short", label: "Emergency contact name", required: true },
      { id: "contact_phone", type: "short", label: "Emergency contact phone", required: true },
      { id: "gp", type: "short", label: "GP surgery" },
      { id: "agree", type: "agree", label: "I have read and agree to this working agreement.", required: true },
      sig,
    ],
  },
  pet_details: {
    key: "pet_details",
    name: "Pet details and permission",
    kind: "questionnaire",
    blurb: "Breed, health, vaccinations, behaviour and the vet's details.",
    blocks: [
      { id: "pet", type: "short", label: "Pet's name", required: true },
      { id: "breed", type: "short", label: "Breed and age", required: true },
      { id: "vaccinated", type: "yesno", label: "Are their vaccinations up to date?", required: true },
      medical("health", "Any health conditions, allergies or medication?"),
      medical("behaviour", "Anything about their behaviour we should know? (for example nervous with dryers, dislikes feet being handled)"),
      { id: "vet", type: "short", label: "Vet's name and phone number", required: true },
      { id: "vetok", type: "agree", label: "In an emergency I give permission to contact my vet and agree to pay any vet fees.", required: true },
      sig,
    ],
  },
  parental_consent: {
    key: "parental_consent",
    name: "Parent or guardian consent",
    kind: "consent",
    blurb: "For under-18s: who they are, who to call, and consent.",
    blocks: [
      { id: "child", type: "short", label: "Name of the young person", required: true },
      { id: "child_dob", type: "date", label: "Their date of birth", required: true },
      { id: "parent", type: "short", label: "Your name (parent or guardian)", required: true },
      { id: "phone", type: "short", label: "Your phone number", required: true },
      medical("needs", "Any medical, learning or access needs we should know about?"),
      { id: "consent", type: "agree", label: "I am their parent or guardian and I give my consent.", required: true },
      sig,
    ],
  },
  photo_release: {
    key: "photo_release",
    name: "Photo permission",
    kind: "consent",
    blurb: "Whether photos can be used publicly.",
    blocks: [
      { id: "use", type: "choice", label: "How may we use photos of you or your work?", required: true, options: ["Anywhere, including social media and the website", "In our portfolio only", "Not at all — private only"] },
      { id: "tag", type: "yesno", label: "Happy to be tagged?" },
      sig,
    ],
  },
  job_terms: {
    key: "job_terms",
    name: "Quote and terms",
    kind: "quote",
    blurb: "The work, the price, access, and terms agreed before starting.",
    blocks: [
      { id: "work", type: "long", label: "The work agreed", required: true },
      { id: "price", type: "short", label: "Agreed price", required: true, help: "Including any deposit and whether VAT applies." },
      { id: "start", type: "date", label: "Date the work starts" },
      { id: "access", type: "long", label: "Access, parking, keys or pets we should know about" },
      { id: "terms", type: "text", label: "Edit this paragraph with your own terms: payment due dates, cancellation, what happens if the job changes once started." },
      { id: "agree", type: "agree", label: "I accept this quote and the terms above.", required: true },
      sig,
    ],
  },
  general_consent: {
    key: "general_consent",
    name: "Client consent",
    kind: "consent",
    blurb: "Name, date of birth, health and agreement to your terms.",
    blocks: [
      CHECK_WORDING,
      dob,
      medical("health", "Is there anything about your health we should know before your appointment?"),
      { id: "terms", type: "text", label: "Edit this paragraph with your own terms and cancellation policy." },
      { id: "agree", type: "agree", label: "I have answered honestly and agree to the terms above.", required: true },
      sig,
    ],
  },
};

const BY_TRADE: Record<string, string[]> = {
  tattoo: ["tattoo_consent", "aftercare", "photo_release"],
  salon: ["patch_test", "general_consent", "photo_release"],
  mobile_hair: ["patch_test", "general_consent"],
  barber: ["general_consent", "photo_release"],
  beautician: ["beauty_consultation", "patch_test", "aftercare"],
  nails: ["beauty_consultation", "photo_release"],
  aesthetics: ["aesthetics_medical", "aftercare", "photo_release"],
  massage: ["health_questionnaire", "beauty_consultation"],
  physio: ["health_questionnaire", "general_consent"],
  chiro: ["health_questionnaire", "general_consent"],
  podiatrist: ["health_questionnaire", "general_consent"],
  pt: ["health_questionnaire", "general_consent"],
  counsellor: ["therapy_agreement"],
  dog_groomer: ["pet_details", "photo_release"],
  dog_walker: ["pet_details"],
  tutor: ["parental_consent", "general_consent"],
  driving_instructor: ["general_consent", "parental_consent"],
  photographer: ["photo_release", "parental_consent", "job_terms"],
};

const BY_CATEGORY: Record<string, string[]> = {
  "Trades and home": ["job_terms"],
  Motoring: ["job_terms"],
  "Hair and beauty": ["general_consent"],
  "Health and wellbeing": ["health_questionnaire"],
  Pets: ["pet_details"],
  "Everything else": ["general_consent", "job_terms"],
};

/**
 * The starters worth offering this business, most useful first, then every
 * other starter behind them — a groomer who also wants a quote form can have
 * one; it is just not the first thing they are shown.
 */
export function startersFor(trade: { id: string; category: string }): { suggested: Starter[]; others: Starter[] } {
  const keys = BY_TRADE[trade.id] ?? BY_CATEGORY[trade.category] ?? ["general_consent"];
  const suggested = keys.map((k) => STARTERS[k]).filter(Boolean);
  const others = Object.values(STARTERS).filter((s) => !keys.includes(s.key));
  return { suggested, others };
}

export function starter(key: string): Starter | null {
  return STARTERS[key] ?? null;
}

export const ALL_STARTERS = Object.values(STARTERS);
