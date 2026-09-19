/**
 * The short name that goes in somebody's own link and their own address.
 *
 * It ends up in two places a customer sees — second-pair.com/widget/salon?with=aisha
 * in an Instagram bio, and willow-demo+aisha@in.second-pair.com on an email —
 * so it wants to read like the person and not like a row id.
 *
 * It was the first word of their name, which is right for "Amy Fitch" and
 * wrong the moment a business names people by where they stand. A garage with
 * "Bay 1 — Stevie" and "Bay 2 — Mark" got `bay` and `bay-2`: two people whose
 * addresses say nothing about either of them, and the second one numbered for
 * no reason a customer could see.
 */

/** Down to letters, digits and hyphens, which is all a link or an address wants. */
export function slugPart(value: string): string {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/**
 * The part of a name that is actually the person.
 *
 * A dash is how somebody writes "this is where they work, and this is who they
 * are" — "Bay 1 — Stevie", "MOT bay — Pete", "Chair 3 - Priya". The person is
 * on the right of it. Without one, the first word is the first name, which is
 * how nearly everybody is written down.
 */
export function nameForHandle(fullName: string): string {
  const name = String(fullName ?? "").trim();
  /*
   * A dash that separates, not a dash inside a name.
   *
   * An em or en dash is always the separator — nobody has one in their name.
   * A plain hyphen only counts with space either side: "Chair 3 - Priya" is a
   * place and a person, and "Jean-Luc" is one person, and the spaces are the
   * only thing that tells them apart. Without this, Jean-Luc became "luc".
   */
  const dash = name.split(/\s*[—–]\s*|\s+-\s+/).filter(Boolean);

  if (dash.length > 1) {
    const last = dash[dash.length - 1].trim();
    // Only if it is a name rather than a number: "Dave Ashcroft - 2" is not a person called 2.
    if (/[a-z]/i.test(last)) return last.split(/\s+/)[0];
  }

  return name.split(/\s+/)[0] ?? "";
}

/**
 * A handle for this person that nobody else on the business has.
 *
 * Numbers only when it genuinely clashes, because two Sarahs in a salon is not
 * a rare problem — and a bare "sarah-2" is still better than a surname somebody
 * does not go by.
 */
export function handleFor(fullName: string, taken: Iterable<string>): string {
  const wanted = slugPart(nameForHandle(fullName)) || "team";
  const already = new Set([...taken].map((h) => String(h).toLowerCase()).filter(Boolean));

  let handle = wanted;
  for (let n = 2; already.has(handle); n++) handle = `${wanted}-${n}`;
  return handle;
}
