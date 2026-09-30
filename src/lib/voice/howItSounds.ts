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
 * All British, because the businesses are.
 *
 * ── Two tiers, and the reason the dear one is the default ───────────────────
 *
 * Giles, after a second real call: "it wasnt the best voice etc it needs
 * improving."
 *
 * Twilio bills text to speech in three tiers — standard, neural, generative —
 * at 0.08p, 0.32p and 1.3p per hundred characters. Every voice within a tier
 * costs the same whoever makes it. This list used only the middle one, because
 * when it was written the top one was the thing that had just been fixed:
 * moving off Twilio's American "alice" onto a British neural voice.
 *
 * Generative is four times the price of neural and it is still small: a six
 * turn call says roughly nine hundred characters, so about 12p rather than 3p.
 * On a call the voice is not part of the experience, it is the whole of it —
 * the caller has nothing else to judge by — and 9p is not a reason to sound
 * like a machine to somebody deciding whether to book.
 *
 * So the default is generative and the neural ones stay, marked as cheaper, so
 * a business that would rather have the pennies can go back in one click. That
 * was Giles's condition: "make it the default, re-cost it, and have the
 * ability to switch back."
 *
 * The cost is metered now rather than assumed — see lib/voice/callCost, which
 * counts characters spoken at the rate of whichever tier said them.
 */
export const VOICES = [
  /*
   * ── Neural first, and why it is the default again ──────────────────────────
   *
   * Giles, 30 Sep, ringing Amber's number: "it did send the text but when it
   * stopped ringing it was like it answered but didn't say anything."
   *
   * Which is the failure this file's own comment predicted, in writing, in the
   * paragraph below: an unsupported voice does not fall back, it fails the
   * <Say>, and a caller hears silence. The generative tier is enabled per Twilio
   * account and nothing here can read whether it is on. It evidently is not.
   *
   * So the proven voice is the default and generative is a choice. That inverts
   * the risk in the only direction that makes sense: the worst case is now a
   * slightly less natural British voice, where before it was a live client's
   * phone line answering a stranger with nothing at all. A voice that might not
   * speak has no business being what every business gets by default.
   *
   * This reverses a decision Giles made deliberately - "make it the default,
   * re-cost it, and have the ability to switch back" - and the reason is that it
   * does not work, not that it was the wrong call. The switch back is one
   * variable: RECEPTIONIST_VOICE=Polly.Amy-Generative in Vercel, once generative
   * is enabled on the Twilio account. Same voice, same person, better engine.
   *
   * Worth being honest about the diagnosis: Twilio's credentials live only in
   * Vercel, so its error log could not be read from here. The spoken text is
   * never empty and the text message went, so the webhook ran and the <Say>
   * specifically produced no audio - which points hard at the voice attribute
   * and is not the same as having seen the error.
   */
  {
    id: "Polly.Amy-Neural",
    label: "Amy",
    what: "British, warm. The default, and proved on a real call",
    tier: "neural",
  },
  {
    id: "Polly.Amy-Generative",
    label: "Amy (most natural, needs enabling at Twilio)",
    what: "The same British voice on the newest engine. Four times the price, and silent unless the generative tier is switched on for the Twilio account",
    tier: "generative",
  },
  { id: "Polly.Emma-Neural", label: "Emma (cheaper)", what: "British, brisker", tier: "neural" },
  { id: "Polly.Brian-Neural", label: "Brian (cheaper)", what: "British, male", tier: "neural" },
  { id: "Polly.Arthur-Neural", label: "Arthur (cheaper)", what: "British, male, older", tier: "neural" },
] as const;

export const DEFAULT_VOICE = VOICES[0].id;

/**
 * Which price tier a voice bills at. Unknown names bill as the default's.
 *
 * Reads VOICES[0] rather than naming a tier, so moving the default between tiers
 * cannot leave the meter quoting the old price.
 */
export function tierOf(voice: string | null | undefined): "generative" | "neural" {
  return VOICES.find((v) => v.id === voice)?.tier ?? VOICES[0].tier;
}

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
