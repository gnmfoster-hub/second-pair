/**
 * Everything the assistant said this turn, in the order it said it.
 *
 * A turn can speak more than once: a word before it goes to look something up,
 * then the answer. Only the last of those used to survive, because each pass
 * of the loop overwrote the one before — so the assistant said "right, I'll
 * move that to the 10th at 9.30", moved it, and the customer received nothing
 * but "anything else you need, just shout". The booking really had moved. She
 * would have turned up on the 17th.
 *
 * The model is not confused when this happens, which is what makes it nasty:
 * its own words are sitting in the history, so it quite reasonably does not say
 * them again. It has already told her. Only the customer was left out.
 */

/**
 * Whitespace-flattened and case-folded, for comparing what was said.
 *
 * A full stop at the end is dropped, because a sentence and the same sentence
 * continued are the same opening — "Priya's got Thursday." is the start of
 * "Priya's got Thursday at 9 or 9:30", and the stop is the only thing that
 * says otherwise.
 */
const gist = (s: string) =>
  s.replace(/\s+/g, " ").trim().toLowerCase().replace(/[.!?,…]+$/, "");

export function joinReply(parts: string[]): string {
  const kept: string[] = [];

  for (const raw of parts) {
    const part = raw.trim();
    if (!part) continue;

    const g = gist(part);

    /*
     * A model that repeats itself at the end should not be quoted twice, and
     * the fuller version is the one worth keeping. "Priya's got Thursday" then
     * "Priya's got Thursday at 9 or 9.30" is one sentence arriving in two
     * goes, not two sentences.
     */
    const already = kept.findIndex((k) => gist(k).includes(g));
    if (already >= 0) continue;

    const supersedes = kept.findIndex((k) => g.includes(gist(k)));
    if (supersedes >= 0) {
      kept[supersedes] = part;
      continue;
    }

    kept.push(part);
  }

  return kept.join("\n\n");
}
