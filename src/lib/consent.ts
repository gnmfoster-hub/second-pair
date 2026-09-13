import type { SupabaseClient } from "@supabase/supabase-js";

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

/*
 * Whether the database has the two evidence columns yet.
 *
 * Asked once per process and remembered. Without this, code that writes them
 * before the migration runs does not degrade — the whole update is rejected,
 * and saving a client stops working entirely. That is not hypothetical: it is
 * what this file did for the twenty minutes between being deployed and being
 * noticed, and it is the second time today I have shipped a write against a
 * column that was not there yet.
 *
 * It answers true forever once the migration lands, so the cost is one query
 * on the first save after a deploy.
 */
let evidenceColumns: boolean | null = null;

export async function canRecordEvidence(db: SupabaseClient): Promise<boolean> {
  if (evidenceColumns !== null) return evidenceColumns;
  const { error } = await db.from("contacts").select("marketing_consent_at").limit(0);
  evidenceColumns = !error;
  return evidenceColumns;
}

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
  /**
   * Whether the evidence columns exist. False writes the tick and nothing
   * else, so a deploy that lands before its migration still saves a client
   * rather than refusing to.
   */
  canEvidence = true,
  now: Date = new Date(),
): ConsentFields {
  if (!canEvidence) return { marketing_consent: ticked };

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
