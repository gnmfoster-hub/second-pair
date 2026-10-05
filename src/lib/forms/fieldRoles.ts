/**
 * What a question on a form is actually asking for.
 *
 * A form has always been a sheet of paper that happened to be on a screen: the
 * answers went into a jsonb blob keyed by eight random characters, and nothing
 * could ever read them again. So a dog walker asked for a mobile number that
 * was already on the record, and the vaccination expiry the customer typed in
 * sat in a blob while the product went on cheerfully booking a dog whose jabs
 * had run out, because the fact that stops that lives somewhere else.
 *
 * A role fixes both ends with one idea. Saying "this box is their mobile" means
 * the box arrives already filled in, and means the answer goes back where it
 * belongs. Giles, 5 October: "it needs to auto fill the fields already on the
 * client record and then when it is completed by the customer it needs to fill
 * in the client record with relevant info."
 *
 * Four destinations, because there are only four kinds of thing a form learns:
 *
 *   - a detail we hold about the person        name, phone, email, address
 *   - a fact this trade acts on                vaccination_due, breed, recall
 *   - something that must never be missed      alert
 *   - everything else worth keeping            note
 *
 * The first two are the useful ones. A trade fact is not a filing cabinet: an
 * expired vaccination already refuses a booking and already sends a reminder,
 * so a form that fills one in is feeding machinery rather than paperwork.
 *
 * Pure, and with no imports that reach a database, so the rules about what a
 * customer's answer may overwrite are tested rather than hoped for.
 */

/** Columns on the person. */
export const PERSON_ROLES = ["name", "phone", "email", "address", "postcode"] as const;
export type PersonRole = (typeof PERSON_ROLES)[number];

export type FieldRole = PersonRole | "alert" | "note" | `fact:${string}`;

/** What we already hold, for filling the form in. */
export type Known = {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  postcode?: string | null;
  alert?: string | null;
  notes?: string | null;
  facts?: Record<string, string> | null;
};

/** What a completed form wants written back. */
export type ToSave = {
  /** Columns on contacts. Only ever ones with something in them. */
  person: Partial<Record<PersonRole, string>>;
  /** Trade facts, merged over whatever is there. */
  facts: Record<string, string>;
  /** The whole alert, where it has changed. Null means leave it alone. */
  alert: string | null;
  /** The whole notes field, where it has changed. Null means leave it alone. */
  notes: string | null;
};

const isPersonRole = (r: FieldRole): r is PersonRole =>
  (PERSON_ROLES as readonly string[]).includes(r);

const isRole = (r: unknown): r is FieldRole => {
  if (typeof r !== "string") return false;
  if ((PERSON_ROLES as readonly string[]).includes(r)) return true;
  if (r === "alert" || r === "note") return true;
  return r.startsWith("fact:") && r.length > 5 && /^[a-z0-9_]{1,40}$/.test(r.slice(5));
};

/** The role on a block, where it has a sound one. */
export function roleOf(block: { role?: unknown }): FieldRole | null {
  return isRole(block.role) ? block.role : null;
}

/**
 * The answers to start the form with.
 *
 * Only roles are filled. A box labelled "Your phone number" with no role stays
 * empty, because guessing from the wording is how a form confidently fills in
 * the wrong thing: "who is your emergency contact's phone number" contains the
 * word phone too.
 */
export function prefillFor(
  blocks: { id: string; role?: unknown; type?: string }[],
  known: Known,
): Record<string, string> {
  const out: Record<string, string> = {};
  const facts = known.facts ?? {};

  for (const b of blocks) {
    const role = roleOf(b);
    if (!role) continue;

    /*
     * Never the alert or the notes. Those are the business's own words about
     * somebody, written for themselves, and a customer should not be shown
     * them, let alone asked to confirm them.
     */
    if (role === "alert" || role === "note") continue;

    const value = role.startsWith("fact:")
      ? facts[role.slice(5)]
      : (known as Record<string, unknown>)[role];

    const text = typeof value === "string" ? value.trim() : "";
    if (text) out[b.id] = text;
  }

  return out;
}

/**
 * Add a line to something already written, without repeating it.
 *
 * Used for the alert and the notes, both of which the business may have typed
 * into themselves. Replacing either with a customer's answer would throw away
 * something somebody wrote on purpose, so a new line is added and an existing
 * one is left alone.
 */
function addLine(existing: string | null | undefined, line: string): string | null {
  const was = (existing ?? "").trim();
  const add = line.trim();
  if (!add) return null;
  if (!was) return add;

  const already = was
    .split(/\r?\n/)
    .map((l) => l.trim().toLowerCase())
    .includes(add.toLowerCase());

  return already ? null : `${was}\n${add}`;
}

/**
 * What to write back, given what they answered.
 *
 * ── The rule that matters ───────────────────────────────────────────────────
 *
 * An empty answer never clears anything. It is the same rule as the diary's
 * client picker and for the same reason: somebody who skips a question has not
 * asked for their phone number to be deleted, and a contact with an empty
 * string for a phone reads as reachable to every query that asks.
 */
export function whatToSave(
  blocks: { id: string; role?: unknown; label?: string }[],
  answers: Record<string, string>,
  known: Known = {},
): ToSave {
  const out: ToSave = { person: {}, facts: {}, alert: null, notes: null };

  let alert = known.alert ?? null;
  let notes = known.notes ?? null;

  for (const b of blocks) {
    const role = roleOf(b);
    if (!role) continue;

    const given = (answers[b.id] ?? "").trim();
    if (!given) continue;

    if (role === "alert") {
      /*
       * Worth the label as well as the answer. "Reactive to dogs" on its own is
       * a sentence somebody has to work out; "Behaviour to know about: reactive
       * to dogs" is one they can act on at a glance.
       */
      const said = b.label ? `${b.label.replace(/[:\s]+$/, "")}: ${given}` : given;
      const next = addLine(alert, said);
      if (next) {
        alert = next;
        out.alert = next;
      }
      continue;
    }

    if (role === "note") {
      const said = b.label ? `${b.label.replace(/[:\s]+$/, "")}: ${given}` : given;
      const next = addLine(notes, said);
      if (next) {
        notes = next;
        out.notes = next;
      }
      continue;
    }

    if (role.startsWith("fact:")) {
      out.facts[role.slice(5)] = given;
      continue;
    }

    /* Everything left is a column on the person, said so it narrows. */
    if (!isPersonRole(role)) continue;
    out.person[role] = role === "email" ? given.toLowerCase() : given;
  }

  return out;
}

/**
 * The roles a business can pick from, for the form editor.
 *
 * Trade facts are added to this per business, because they differ by trade: a
 * dog walker has a vaccination expiry and a garage has an MOT date, and
 * offering both to both is how a form ends up asking a hairdresser for a
 * registration number.
 */
export const PERSON_ROLE_LABELS: { value: PersonRole; label: string }[] = [
  { value: "name", label: "Their name" },
  { value: "phone", label: "Their mobile" },
  { value: "email", label: "Their email" },
  { value: "address", label: "Their address" },
  { value: "postcode", label: "Their postcode" },
];
