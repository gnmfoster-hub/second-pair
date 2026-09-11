"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { usableAddress } from "@/lib/messaging/address";
import { sendEmail, emailConfigured } from "@/lib/messaging/email";

export type InterestState = { ok?: boolean; error?: string };

/**
 * Somebody asking to be told when a product is ready.
 *
 * Family APP! is on neither app store yet — Android is a direct download and
 * iOS is TestFlight — so the honest thing a page can offer is to remember who
 * wanted it. That only works if the list is actually kept and actually
 * reaches somebody, which is what this is.
 *
 * Runs with the service key rather than the visitor's session. The table has
 * no policies at all, so nothing in a browser can read or write it however it
 * asks, and every rule about what may go in lives here in one place. A public
 * form backed by an anon insert policy is an open door with a form in front
 * of it.
 */
export async function registerInterest(
  _prev: InterestState,
  fd: FormData,
): Promise<InterestState> {
  /*
   * The honeypot, first and cheapest.
   *
   * A field no person can see and every naive bot fills in. Anything in it and
   * the request is answered exactly as a success — telling a bot it was caught
   * is telling whoever wrote it what to change.
   */
  if (String(fd.get("website") ?? "").trim()) return { ok: true };

  const product = String(fd.get("product") ?? "").trim().slice(0, 60);
  if (!product) return { error: "Something went wrong. Try again in a moment." };

  const email = usableAddress(String(fd.get("email") ?? ""));
  if (!email) {
    return { error: "That does not look like an email address — check it and try again." };
  }

  const name = String(fd.get("name") ?? "").trim().slice(0, 120) || null;
  const note = String(fd.get("note") ?? "").trim().slice(0, 600) || null;
  const source = String(fd.get("source") ?? "").trim().slice(0, 120) || null;

  const db = createAdminClient();

  /*
   * Asking twice is enthusiasm, not an error.
   *
   * The unique index refuses a second row for the same person and product, and
   * somebody who fills the form in again — because they forgot, or because
   * nothing has happened yet — should be thanked rather than told off.
   */
  const { error } = await db.from("product_interest").upsert(
    { product, email, name, note, source },
    { onConflict: "product,email", ignoreDuplicates: true },
  );

  if (error && !/duplicate|conflict/i.test(error.message)) {
    console.error("[interest]", error.message);
    return { error: "Could not save that just now. Try again in a moment." };
  }

  /*
   * Told about, not just written down.
   *
   * A list nobody looks at is the same as no list, and the whole value of an
   * early-access form is knowing somebody wanted it on the day they wanted it.
   * Never allowed to fail the request: they asked, it is saved, and whether we
   * managed to email ourselves about it is our problem rather than theirs.
   */
  if (emailConfigured()) {
    const to = process.env.INTEREST_EMAIL || process.env.EMAIL_FROM;
    if (to) {
      void sendEmail({
        to,
        subject: `${product}: ${name || email} wants early access`,
        text: [
          `${name || "Somebody"} asked to be told when ${product} is ready.`,
          "",
          `Email:  ${email}`,
          ...(name ? [`Name:   ${name}`] : []),
          ...(source ? [`From:   ${source}`] : []),
          ...(note ? ["", "They said:", note] : []),
        ].join("\n"),
        fromName: "Second Pair",
      }).catch(() => {});
    }
  }

  return { ok: true };
}
