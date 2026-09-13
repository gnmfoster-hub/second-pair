/**
 * Recording that somebody agreed to be marketed to, in a way that would stand up.
 *
 * There is a boolean for this and a checkbox that sets it, and under PECR a
 * boolean is not consent. What is asked for is evidence: when it was given and
 * by what means. "Somebody ticked a box in our system at some point" is what a
 * business has without this, and it is precisely what the ICO says is not
 * enough if it is ever questioned.
 *
 * Nothing here sends marketing yet, which is the right moment to get it right.
 * The alternative is a year of ticks nobody can date and a list that cannot
 * lawfully be used at the moment somebody wants to use it.
 */

export type ConsentFields = {
  marketing_consent: boolean;
  marketing_consent_at?: string | null;
  marketing_consent_source?: string | null;
};

/**
 * What to write when the box is ticked or cleared.
 *
 * Ticking stamps the moment and who recorded it. Clearing wipes both, because
 * the evidence is evidence of a permission that no longer exists — keeping the
 * date of a withdrawn consent invites somebody to read it as a live one.
 *
 * Re-saving a record whose box was already ticked leaves the original date
 * alone. Somebody editing a phone number must not silently restamp consent to
 * today, which would quietly turn an old agreement into a fresh-looking one
 * every time anybody touched the record.
 */
export function consentPatch(
  ticked: boolean,
  existing: { marketing_consent?: boolean; marketing_consent_at?: string | null } | null,
  recordedBy: string,
  now: Date = new Date(),
): ConsentFields {
  if (!ticked) {
    return {
      marketing_consent: false,
      marketing_consent_at: null,
      marketing_consent_source: null,
    };
  }

  // Already agreed, and already evidenced: leave the evidence alone.
  if (existing?.marketing_consent && existing.marketing_consent_at) {
    return { marketing_consent: true };
  }

  return {
    marketing_consent: true,
    marketing_consent_at: now.toISOString(),
    marketing_consent_source: recordedBy,
  };
}

/**
 * What the screen says about it, in words rather than a tick.
 *
 * The three states are genuinely different and a checkbox shows two of them.
 * "Agreed, date unknown" is the honest description of every tick made before
 * this existed, and saying so is what stops somebody relying on it.
 */
export function describeConsent(contact: {
  marketing_consent?: boolean;
  marketing_consent_at?: string | null;
  marketing_consent_source?: string | null;
}): { text: string; evidenced: boolean } {
  if (!contact.marketing_consent) {
    return { text: "Has not agreed to marketing", evidenced: false };
  }

  if (!contact.marketing_consent_at) {
    return {
      text: "Agreed, but nobody recorded when — treat as unusable until they say again",
      evidenced: false,
    };
  }

  const when = new Date(contact.marketing_consent_at).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return {
    text: contact.marketing_consent_source
      ? `Agreed ${when}, ${contact.marketing_consent_source}`
      : `Agreed ${when}`,
    evidenced: true,
  };
}
