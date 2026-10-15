/**
 * Two letters for a name.
 *
 * Its own module, not because it is big but because node cannot strip types
 * from a .tsx file, so anything living in a component cannot be tested
 * without a bundler. This is a pure string function read by the widget
 * status endpoint on the server and by three components, and it is now the
 * first thing a visitor sees of a business on the launcher, so it is worth
 * being able to test.
 */

/**
 * Two letters for a name, ignoring anything that is not a word.
 *
 * The filter is the whole of it, and it was missing. First word and last
 * word is right for a person and wrong for a business, because a business
 * name ends in whatever somebody typed. "Willow & Co (demo)" came back as
 * "W(", and a name ending in "&" would have come back as "&".
 *
 * Found on 15 October while putting these on the widget launcher, where
 * they become the first thing a visitor sees. The panel's own header has
 * been showing "W(" since the day it was built and nobody had looked.
 */
export function initialsFor(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    /* Only words that start with a letter. "&", "(demo)" and "-" do not. */
    .filter((p) => /^\p{L}/u.test(p));

  if (parts.length === 0) {
    /*
     * Nothing word-shaped in it at all. Two characters of whatever they did
     * type beats a question mark sitting where their name should be.
     */
    const bare = name.trim();
    return bare ? bare.slice(0, 2).toUpperCase() : "?";
  }
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
