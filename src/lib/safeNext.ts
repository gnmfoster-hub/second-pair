/**
 * Where a sign-in link is allowed to send somebody afterwards.
 *
 * `next` arrives in a URL anybody can write, and it is used by the one route
 * that hands out a session — so an off-site value there would be a way to
 * bounce a freshly signed-in person somewhere else with their session already
 * established.
 *
 * Anything that is not plainly a path on this site becomes the home page.
 */
export function safeNext(requested: string | null | undefined): string {
  if (!requested) return "/";

  /*
   * A leading slash, and the next character must not be another slash or a
   * backslash. "//evil.com" is protocol-relative, and several browsers treat
   * "/\evil.com" the same way — which is the version that gets missed.
   */
  return /^\/(?![/\\])/.test(requested) ? requested : "/";
}
