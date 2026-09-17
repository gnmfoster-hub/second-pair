"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireStudio } from "@/lib/studio";
import { hasColumn } from "@/lib/db/hasColumn";
import { samePhone } from "@/lib/channels/phoneNumbers";
import {
  readCsv,
  guessColumns,
  readRow,
  whyNot,
  keyOf,
  type Target,
} from "@/lib/clients/importList";

/**
 * Reading somebody's old client list, and then writing it down.
 *
 * Two steps on purpose. The first reads the file and says what it thinks each
 * column is; the second does the work, after a person has looked at the guess
 * and corrected it. Nothing is written until somebody has seen their own data
 * in our words — an import that silently decides a column called "Accepts
 * Marketing" is consent to text people is the kind of quiet mistake that ends
 * up in front of the ICO.
 */

export type ReadState = {
  error?: string;
  /** The file itself, carried into the second step. */
  csv?: string;
  headers?: string[];
  guessed?: Target[];
  sample?: string[][];
  rows?: number;
};

const MAX_BYTES = 4_000_000;

export async function readFile(_prev: ReadState, fd: FormData): Promise<ReadState> {
  await requireStudio();

  const file = fd.get("file");
  const pasted = String(fd.get("pasted") ?? "").trim();

  let text = pasted;
  if (!text && file instanceof File && file.size > 0) {
    if (file.size > MAX_BYTES) {
      return { error: "That file is bigger than 4MB. Send it to me and I will bring it in for you." };
    }
    text = await file.text();
  }

  if (!text) return { error: "Choose a file, or paste the rows in." };

  const { headers, rows } = readCsv(text);
  if (!headers.length) return { error: "There is no heading row in that — the first line should be the column names." };
  if (!rows.length) return { error: "That has headings but no people under them." };

  return {
    csv: text,
    headers,
    guessed: guessColumns(headers),
    sample: rows.slice(0, 5),
    rows: rows.length,
  };
}

export type BringState = { error?: string; added?: number; skipped?: number; already?: number; why?: string[] };

/**
 * Writing them in, once somebody has said which column is which.
 *
 * Inserted one at a time rather than in one statement, because a list of four
 * hundred people will contain two of somebody and one bad row, and a single
 * failed batch that brings in nought of them is a worse answer than 398 in and
 * two explained.
 */
export async function bringThemIn(_prev: BringState, fd: FormData): Promise<BringState> {
  const { studio } = await requireStudio();
  const supabase = await createClient();

  const csv = String(fd.get("csv") ?? "");
  if (!csv) return { error: "The file was lost between the two steps. Start again." };

  const { headers, rows } = readCsv(csv);
  const mapping = headers.map((_, i) => String(fd.get(`col_${i}`) ?? "ignore") as Target);

  if (!mapping.includes("phone") && !mapping.includes("email")) {
    return { error: "Point at least one column at a phone number or an email, or there is no way to reach anybody." };
  }

  const perChannel = await hasColumn(supabase, "contacts", "marketing_email");

  const seen = new Set<string>();
  const why: string[] = [];
  let added = 0;
  let skipped = 0;
  let already = 0;

  for (const [i, row] of rows.entries()) {
    const contact = readRow(headers, mapping, row);

    const no = whyNot(contact);
    if (no) {
      skipped++;
      if (why.length < 12) why.push(`Row ${i + 2}: ${no}`);
      continue;
    }

    // Twice in the same file is once.
    const key = keyOf(contact);
    if (key && seen.has(key)) {
      already++;
      continue;
    }
    if (key) seen.add(key);

    /*
     * Their agreement, marked as imported rather than as given today.
     *
     * A tick in somebody else's export is not evidence that this business
     * asked, and stamping it with today's date would turn a guess into a
     * record. The source says where it came from, and the date stays empty,
     * which is the truthful answer to "when did they agree".
     */
    const agreed = contact.marketingEmail === true || contact.marketingSms === true;

    const { error } = await supabase.from("contacts").insert({
      studio_id: studio.id,
      name: contact.name,
      phone: contact.phone ? samePhone(contact.phone) : null,
      email: contact.email,
      notes: contact.notes,
      alert: contact.alert,
      channel: "web",
      marketing_consent: agreed,
      ...(perChannel
        ? {
            marketing_email: contact.marketingEmail === true,
            marketing_sms: contact.marketingSms === true,
            marketing_consent_source: "imported from their previous system",
          }
        : {}),
    });

    if (error) {
      // Already on file is the good case: they have this person twice and did
      // not know. It is not a failure and it is not worth a line of apology.
      if (error.code === "23505") already++;
      else {
        skipped++;
        if (why.length < 12) why.push(`Row ${i + 2}: ${error.message}`);
      }
      continue;
    }

    added++;
  }

  revalidatePath("/clients");
  return { added, skipped, already, why };
}
