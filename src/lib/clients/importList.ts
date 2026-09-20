/**
 * Bringing a client list in from whatever they used before.
 *
 * The commonest reason a business says no. Somebody with four hundred
 * customers in Fresha, or a spreadsheet their sister-in-law set up in 2019, is
 * not going to retype them — so "you can try it, but you start empty" is the
 * end of the conversation, however good the rest of it is.
 *
 * Every system exports a different shape and most of the columns are empty
 * anyway, so this does not ask anybody to format to a template. It reads
 * whatever file they have, guesses which column is which, and shows them the
 * guess to correct. A matching step is more work than a fixed template and it
 * is the difference between "export from your old system and upload it" and
 * "rearrange a spreadsheet first", which is where people stop.
 *
 * Pure, and alone in its file, because the rules about what becomes somebody's
 * marketing consent should be readable without a database client in the way.
 */

/** What a column can be pointed at. */
export type Target =
  | "ignore"
  | "name"
  | "first_name"
  | "last_name"
  | "phone"
  | "email"
  | "alert"
  | "notes"
  | "marketing_email"
  | "marketing_sms"
  | "blocked"
  | "keep";

export type FieldSpec = {
  target: Target;
  label: string;
  /** What a header has to look like for this to be the first guess. */
  matches: RegExp;
  /** Said under the column when it is chosen. */
  hint?: string;
};

/**
 * The fields worth pointing a column at, in the order they are offered.
 *
 * "Keep" is the important one. A list carries a date of birth, an address, a
 * referral source and a pile of tags, and we have nowhere typed to put any of
 * them — but throwing away somebody's customer data because our schema is
 * narrower than theirs is not a defensible thing to do on an import screen.
 * Kept columns go onto the record's notes, labelled, where a person can read
 * them and act on them.
 */
export const FIELDS: FieldSpec[] = [
  { target: "name", label: "Full name", matches: /^(full\s*name|client|customer|name)$/i },
  { target: "first_name", label: "First name", matches: /^(first\s*name|forename|given\s*name)$/i },
  { target: "last_name", label: "Last name", matches: /^(last\s*name|surname|family\s*name)$/i },
  {
    target: "phone",
    label: "Phone",
    matches: /^(mobile(\s*(number|phone))?|phone|telephone|tel|contact\s*number|cell)$/i,
    hint: "A mobile is preferred, because it is the only number we can text.",
  },
  { target: "email", label: "Email", matches: /^(e-?mail(\s*address)?)$/i },
  {
    target: "marketing_email",
    label: "Agreed to marketing email",
    matches: /^(accepts?\s*(email\s*)?marketing|email\s*marketing|marketing\s*consent|newsletter)$/i,
  },
  {
    target: "marketing_sms",
    label: "Agreed to marketing texts",
    matches: /^(accepts?\s*(sms|text)s?(\s*marketing)?|sms\s*marketing|text\s*marketing)$/i,
  },
  {
    target: "blocked",
    label: "Blocked",
    matches: /^(blocked|blacklisted|banned|is\s*blocked)$/i,
    hint: "A yes puts a warning on their record wherever they appear.",
  },
  {
    target: "alert",
    label: "Warning on their record",
    matches: /^(block\s*reason|blocked\s*reason|alert|staff\s*alert|warning|allerg)/i,
  },
  { target: "notes", label: "Notes", matches: /^(notes?|comments?|remarks?)$/i },
  {
    target: "keep",
    label: "Keep, in their notes",
    matches:
      /^(d\.?o\.?b\.?|date\s*of\s*birth|birth|address|post\s*code|postcode|zip|town|city|county|gender|tags?|referr?al(\s*source)?|source|added|agreed\s*on|first\s*seen|instagram|last\s*(seen|visit))/i,
    hint: "We have nowhere typed for this, so it is written into their notes rather than lost.",
  },
  { target: "ignore", label: "Do not import", matches: /^(id|client\s*id|customer\s*id)$/i },
];

/**
 * A comma-separated file, read the way a spreadsheet wrote it.
 *
 * Quoted fields, commas and newlines inside them, doubled quotes for a literal
 * one, a byte-order mark from Excel, and either line ending. Written out
 * rather than pulled in because a dependency for this is a dependency to keep
 * updated forever, and the awkward parts are awkward in a knowable way.
 */
export function readCsv(text: string): { headers: string[]; rows: string[][] } {
  const clean = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];

    if (quoted) {
      if (c === '"') {
        if (clean[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
      continue;
    }

    if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      // \r\n is one ending, not two.
      if (c === "\r" && clean[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((v) => v.trim() !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }

  row.push(cell);
  if (row.some((v) => v.trim() !== "")) rows.push(row);

  const headers = (rows.shift() ?? []).map((h) => h.trim());
  return { headers, rows };
}

/** The first guess at what a column is, by its heading. */
export function guessColumn(header: string): Target {
  const name = header.trim();
  if (!name) return "ignore";
  for (const field of FIELDS) {
    if (field.matches.test(name)) return field.target;
  }
  return "ignore";
}

/** A guess for every column, which the owner then corrects. */
export function guessColumns(headers: string[]): Target[] {
  const guessed = headers.map(guessColumn);

  /*
   * One name column, not three. Fresha exports a first name, a last name and
   * a full name made out of both, and importing all three writes the name
   * twice and then overwrites it with itself. Where a full name is present it
   * wins, because it is the one that is right when somebody has two surnames
   * or no surname at all.
   */
  if (guessed.includes("name")) {
    for (let i = 0; i < guessed.length; i++) {
      if (guessed[i] === "first_name" || guessed[i] === "last_name") guessed[i] = "ignore";
    }
  }

  return guessed;
}

/** Yes, no, or nothing said — from whatever a spreadsheet calls it. */
export function readTick(raw: string | undefined): boolean | null {
  const value = (raw ?? "").trim().toLowerCase();
  if (!value) return null;

  /*
   * "Agreed" is in this list because it is the word we write ourselves.
   *
   * Our own export puts "Agreed" in the two marketing columns. Our own import
   * did not know it, so a business exporting its list and putting it back —
   * moving between two of our own screens, or sending it to us to fix
   * something — lost everybody's consent to "nothing said". Two halves of the
   * same product disagreeing about a word one of them wrote.
   */
  if (["yes", "y", "true", "1", "on", "agreed", "subscribed", "opted in", "opted-in"].includes(value)) {
    return true;
  }
  if (
    ["no", "n", "false", "0", "off", "declined", "unsubscribed", "opted out", "opted-out"].includes(value)
  ) {
    return false;
  }
  return null;
}

export type ImportedContact = {
  name: string | null;
  phone: string | null;
  email: string | null;
  alert: string | null;
  notes: string | null;
  marketingEmail: boolean | null;
  marketingSms: boolean | null;
};

/**
 * One row, read through the owner's own mapping.
 *
 * Nothing is invented. A blank stays blank, an unreadable tick stays unknown
 * rather than becoming a no, and a column pointed at nothing is not read at
 * all. The one composed field is the notes, which gathers whatever was kept
 * under its own heading so a person can see where it came from.
 */
export function readRow(
  headers: string[],
  mapping: Target[],
  row: string[],
): ImportedContact {
  const at = (target: Target) => {
    const i = mapping.indexOf(target);
    return i === -1 ? "" : (row[i] ?? "").trim();
  };

  const full = at("name");
  const first = at("first_name");
  const last = at("last_name");
  const name = full || [first, last].filter(Boolean).join(" ") || null;

  const kept: string[] = [];
  for (let i = 0; i < mapping.length; i++) {
    if (mapping[i] !== "keep") continue;
    const value = (row[i] ?? "").trim();
    if (value) kept.push(`${headers[i]}: ${value}`);
  }

  const notes = [at("notes"), kept.join("\n")].filter(Boolean).join("\n") || null;

  /*
   * Blocked and the reason for it become the warning on their record, because
   * that is the field this product already shows wherever somebody appears.
   * A block with no reason still has to say something, or the record carries a
   * warning nobody can act on.
   */
  const blocked = readTick(at("blocked"));
  const reason = at("alert");
  const alert =
    blocked === true ? `Blocked in their old system${reason ? `: ${reason}` : ""}` : reason || null;

  return {
    name,
    phone: at("phone") || null,
    email: at("email") || null,
    alert,
    notes,
    marketingEmail: readTick(at("marketing_email")),
    marketingSms: readTick(at("marketing_sms")),
  };
}

/** Why a row cannot be brought in, in words for the person importing. */
export function whyNot(contact: ImportedContact): string | null {
  if (!contact.name && !contact.phone && !contact.email) return "No name, number or email";
  if (!contact.phone && !contact.email) return "No way to reach them";
  return null;
}

/**
 * The same person twice.
 *
 * Lists are full of them — somebody added at the desk and again over the
 * phone. Matched on a number first and an address second, both flattened,
 * because that is what the database considers unique anyway: importing a
 * duplicate does not make two records, it makes one failure and a row nobody
 * can explain.
 */
export function keyOf(contact: ImportedContact): string | null {
  const phone = (contact.phone ?? "").replace(/\D/g, "");
  if (phone.length >= 9) return `p:${phone.slice(-9)}`;
  const email = (contact.email ?? "").trim().toLowerCase();
  return email ? `e:${email}` : null;
}
