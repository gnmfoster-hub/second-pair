/**
 * Whether a business already asks something, however they worded it.
 *
 * A trade brings its usual questions and an owner writes their own, and the
 * two overlap in wording rather than in text: "Do you take walk-ins?" against
 * "Do you do Walk ins?" is the same question typed by two different people,
 * and offering the second to somebody who has already answered the first is
 * how a tidy list turns into a confusing one.
 *
 * Deliberately blunt. Punctuation, spacing, case and a few plurals go, and
 * what is left is compared as a whole and by containment. It will miss a
 * genuine rewording — "what happens after" for aftercare — and that costs a
 * near-duplicate somebody deletes in one click. Matching more cleverly risks
 * silently withholding a question they have never answered, which costs an
 * escalation to the owner every time a customer asks it.
 */

const bones = (question: string): string =>
  question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\b(do|does|you|your|the|a|an|is|are|it|to|i|my|we|us|can|and|of|for)\b/g, "")
    .replace(/s\b/g, "")
    .replace(/\s+/g, "");

export function askedAlready(question: string, existing: string[]): boolean {
  const one = bones(question);
  if (!one) return true;

  return existing.some((other) => {
    const two = bones(other);
    if (!two) return false;
    return one === two || one.includes(two) || two.includes(one);
  });
}

/** The trade's questions this business has not asked in some form already. */
export function stillWorthAsking(suggested: string[], existing: string[]): string[] {
  const kept: string[] = [];
  for (const question of suggested) {
    if (!askedAlready(question, [...existing, ...kept])) kept.push(question);
  }
  return kept;
}
