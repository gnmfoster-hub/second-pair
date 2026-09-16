/**
 * The example question to show an owner beside "what they do".
 *
 * It used to be one hardcoded sentence — "it lets the assistant answer a
 * question like 'who does the MOTs?'" — shown to every trade on the product.
 * An electrician reads that and either laughs or wonders what kind of software
 * this is. The whole promise of the trade packs is that a business never sees
 * somebody else's words, and the words on this hint were nobody's but a
 * garage's.
 *
 * So it is built from the trade's own roles. The first role is usually the
 * generic one — "Electrician" for an electrician, "Stylist" for a salon — and
 * naming it back asks nothing useful, so the first role that is not simply
 * what everybody there is called is the one that makes the point.
 *
 * Pure, and its own file, so every trade's version can be checked at once.
 */

export function askAboutRole(roles: string[], noun: string): string | null {
  const everybody = (noun ?? "").trim().toLowerCase();

  const specific = roles.find((role) => {
    const it = role.trim().toLowerCase();
    return it && it !== everybody && !it.endsWith(` ${everybody}`) && it !== `${everybody}s`;
  });

  const pick = specific ?? roles.find((role) => role.trim().length > 0);
  if (!pick) return null;

  return `who is your ${pick.trim().toLowerCase()}?`;
}
