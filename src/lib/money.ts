/** Money is integer pence throughout. These are the only places it becomes a string. */

export function formatPence(pence: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: pence % 100 === 0 ? 0 : 2,
  }).format(pence / 100);
}

export function formatRange(lowPence: number, highPence: number): string {
  if (lowPence === highPence) return formatPence(lowPence);
  return `${formatPence(lowPence)} to ${formatPence(highPence)}`;
}

/**
 * Parse a pounds string from a form field into pence.
 * Accepts "120", "120.50", "£120.50", "1,200". Returns null if unparseable.
 */
export function parsePounds(input: FormDataEntryValue | null | undefined): number | null {
  if (input == null) return null;
  const cleaned = String(input).replace(/[£,\s]/g, "");
  if (cleaned === "") return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

/**
 * Fills placeholders in a studio's policy text with the real figures.
 *
 * The policy is read out to clients word for word, so a placeholder that
 * survives to the client ("Your deposit is {{amount}}") is worse than not
 * offering placeholders at all. Anything unrecognised is stripped rather than
 * spoken.
 */
export function renderPolicy(
  policy: string,
  values: { deposit?: number | null },
): string {
  if (!policy.includes("{{")) return policy;

  return policy
    .replace(/\{\{\s*(amount|deposit|deposit_amount)\s*\}\}/gi, () =>
      values.deposit != null ? formatPence(values.deposit) : "the deposit",
    )
    .replace(/\{\{[^}]*\}\}/g, "")
    .replace(/[ 	]{2,}/g, " ")
    .trim();
}

/** Pence back to a bare pounds string for populating a form input. */
export function penceToInput(pence: number | null | undefined): string {
  if (pence == null) return "";
  return (pence / 100).toFixed(2).replace(/\.00$/, "");
}
