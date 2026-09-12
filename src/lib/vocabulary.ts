/**
 * Merging the words a business has chosen with the words a form offers.
 *
 * Kept out of the settings action so it can be tested without a database. It
 * earned that the hard way: the first version returned only the keys the form
 * knows about, which replaced the whole stored object — so saving the business
 * settings deleted the three words the form does not offer, and every real
 * business had all three set.
 */
export type Words = Record<string, string>;

/**
 * @param typed   what the form sent, keyed by word
 * @param owned   the words this form is allowed to change
 * @param pack    the trade's own wording, which an override has to differ from
 * @param stored  what the business has now
 */
export function mergeVocabulary({
  typed,
  owned,
  pack,
  stored,
}: {
  typed: Words;
  owned: readonly string[];
  pack: Words;
  stored: Words;
}): Words {
  const words: Words = { ...stored };

  for (const key of owned) {
    const value = (typed[key] ?? "").trim();

    // Empty, or the trade's own word typed back in, means "no override" —
    // otherwise this year's pack wording freezes into the row and the business
    // stops following improvements to it.
    if (!value || value.toLowerCase() === (pack[key] ?? "").toLowerCase()) delete words[key];
    else words[key] = value;
  }

  return words;
}
