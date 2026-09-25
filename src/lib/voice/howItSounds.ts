/**
 * How one business's Receptionist opens, and which voice says it.
 *
 * Giles, after hearing it: "there would need to be some added tailoring from
 * the businesses."
 *
 * Two things, and deliberately no more. Everything else about how it talks is
 * already a business's to set and already reaches the phone, because the phone
 * uses the same assistant as the texts — tone of voice, house rules, never-say
 * and always-come-and-get-me are all on the Assistant settings and apply on
 * every channel. A second set of those for the telephone would be a second set
 * to keep in step, and they would not stay in step.
 *
 * Pure: the fallbacks are the interesting part and they decide what a stranger
 * hears when a business has filled in nothing.
 */

/**
 * The voices a business may choose, and what they actually are.
 *
 * A short list rather than a free field. Twilio does not validate a voice name
 * in advance — an unknown one is a call that reaches somebody and says nothing
 * at all, which is the worst failure this product has — so the value can only
 * ever be one of these.
 *
 * All British, because the businesses are. The neural builds, because the
 * first real call was judged on pronunciation before anything else.
 */
export const VOICES = [
  { id: "Polly.Amy-Neural", label: "Amy", what: "British, warm, the default" },
  { id: "Polly.Emma-Neural", label: "Emma", what: "British, brisker" },
  { id: "Polly.Brian-Neural", label: "Brian", what: "British, male" },
  { id: "Polly.Arthur-Neural", label: "Arthur", what: "British, male, older" },
] as const;

export const DEFAULT_VOICE = VOICES[0].id;

/**
 * The voice to speak with.
 *
 * Anything unrecognised falls back rather than being passed through. A value
 * from an older list, a typo written straight into the database, a voice
 * Twilio has retired — all of them end as a silent call if trusted, and as the
 * default if not.
 */
export function voiceFor(chosen: string | null | undefined): string {
  return VOICES.some((v) => v.id === chosen) ? (chosen as string) : DEFAULT_VOICE;
}

/** The longest a greeting may be, in characters. About four seconds spoken. */
export const GREETING_LIMIT = 140;

/**
 * The first thing a caller hears.
 *
 * The business's own words where they have written any, and their name where
 * they have not. Never empty: a call that connects to silence is one the
 * caller rings off from, and they do not ring back.
 *
 * Trimmed to length rather than refused. This is read at the moment a stranger
 * is on the line, and the right behaviour there is to say as much of it as is
 * sensible — the settings screen is where somebody is told it is too long, not
 * the telephone.
 */
export function greetingFor(
  written: string | null | undefined,
  businessName: string | null | undefined,
): string {
  const theirs = (written ?? "").trim();
  if (theirs) return theirs.slice(0, GREETING_LIMIT);

  const name = (businessName ?? "").trim();
  return name ? `Hello, ${name}. How can I help?` : "Hello. How can I help?";
}
