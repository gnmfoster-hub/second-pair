/**
 * What a form is made of, and what counts as filling it in.
 *
 * Deliberately a short list. A consent form, a health questionnaire, a
 * waiver and a quote acceptance are all paragraphs, a handful of questions,
 * a tick to agree and a signature — and a business owner building one on a
 * phone between clients will not use twelve kinds of field. Every kind here is
 * one somebody has asked for on a real form.
 *
 * Pure and alone in its file: the page the customer fills in, the server that
 * saves it and the record that shows it all read the same rules, and they are
 * tested once.
 */

import { roleOf } from "./fieldRoles.ts";

export type BlockType =
  | "text" // a paragraph the customer reads
  | "short" // a one-line answer
  | "long" // a few lines
  | "yesno" // yes or no, with an optional "tell us more" when yes
  | "choice" // pick one
  | "date"
  | "agree" // a tick box that must be ticked
  | "signature"
  | "lines" // a priced list, for a quote, set when it is sent, never typed by the customer
  | "repeat"; // a group of questions asked once per dog, room, or vehicle

export type Block = {
  id: string;
  type: BlockType;
  /** The question, or for "text" the paragraph itself. */
  label: string;
  /** Optional small print under the question. */
  help?: string;
  required?: boolean;
  /** For "choice". */
  options?: string[];
  /** For "yesno": ask for detail when they answer yes. */
  detailOnYes?: boolean;
  /** For "lines": what is being quoted, in pence. */
  items?: QuoteLine[];
  /** For "lines": who is giving the quote, where somebody chose to say. */
  by?: { id: string; name: string };
  /**
   * What this question is actually asking for, where it is something we hold.
   *
   * "their mobile", "their vaccination expiry". It fills the box in on the way
   * out and files the answer on the way back. See forms/fieldRoles, which has
   * the rules and the reason they are written down separately.
   */
  role?: string;
  /**
   * For "repeat": the questions asked about each one.
   *
   * One level only. A form that nests a repeating group inside a repeating
   * group is a form nobody can fill in on a phone, and the answer keys stop
   * being readable by anybody debugging them at nine at night.
   */
  children?: Block[];
  /** For "repeat": the words on the button. "Add another dog". */
  addLabel?: string;
  /** For "repeat": what one of them is called. "Dog". */
  each?: string;
};

export type QuoteLine = { name: string; quantity: number; pence: number };

export type Answers = Record<string, string>;

export const BLOCK_TYPES: { value: BlockType; label: string }[] = [
  { value: "text", label: "Paragraph to read" },
  { value: "short", label: "Short answer" },
  { value: "long", label: "Longer answer" },
  { value: "yesno", label: "Yes or no" },
  { value: "choice", label: "Pick one" },
  { value: "date", label: "Date" },
  { value: "agree", label: "Tick to agree" },
  { value: "signature", label: "Signature" },
];

// "lines" is not offered in the editor — a quote's prices are set when it is sent.
/*
 * "lines" and "repeat" are storable but not offered in the editor.
 *
 * A quote's prices are set when it is sent. A repeating group needs somewhere
 * to build the questions asked about each one, and the editor is a flat list
 * with no way to draw that yet, so offering it would only let somebody make an
 * empty group that cleanBlocks then throws away.
 */
const TYPES = new Set<BlockType>([...BLOCK_TYPES.map((t) => t.value), "lines", "repeat"]);
const MAX_BLOCKS = 80;
const MAX_LABEL = 2000;

/** A new id for a block. Short, because it is a key in every answer. */
export function blockId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Blocks as they should be stored, whatever arrived.
 *
 * The editor is ours, but the JSON comes back through a form field, and a
 * template is read by a page anybody with a link can open — so it is cleaned
 * rather than trusted: unknown kinds dropped, text trimmed and capped, ids
 * made unique, and a signature block kept to one.
 */
export function cleanBlocks(raw: unknown): Block[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  let signatures = 0;
  const out: Block[] = [];

  for (const item of raw.slice(0, MAX_BLOCKS)) {
    if (!item || typeof item !== "object") continue;
    const b = item as Record<string, unknown>;
    const type = String(b.type ?? "") as BlockType;
    if (!TYPES.has(type)) continue;
    if (type === "signature" && ++signatures > 1) continue;

    const label = String(b.label ?? "").trim().slice(0, MAX_LABEL);
    if (!label && type !== "signature") continue;

    let id = String(b.id ?? "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24) || blockId();
    while (seen.has(id)) id = blockId();
    seen.add(id);

    const block: Block = { id, type, label: label || "Signature" };
    const help = String(b.help ?? "").trim().slice(0, 500);
    if (help) block.help = help;
    // A paragraph cannot be required and an agreement or signature always is.
    if (type === "agree" || type === "signature") block.required = true;
    else if (type !== "text" && b.required) block.required = true;
    if (type === "choice") {
      const options = (Array.isArray(b.options) ? b.options : [])
        .map((o) => String(o ?? "").trim().slice(0, 200))
        .filter(Boolean)
        .slice(0, 20);
      if (options.length < 2) continue;
      block.options = options;
    }
    if (type === "yesno" && b.detailOnYes) block.detailOnYes = true;

    /*
     * A role, where it is one we know.
     *
     * Checked here rather than trusted, because this is the boundary: the role
     * decides what a customer's answer is allowed to overwrite on the business's
     * own client record, and it arrives through a form field like everything
     * else. Anything unrecognised is dropped rather than carried, so a doctored
     * template cannot aim an answer at a column of its choosing.
     *
     * Never on a paragraph or a signature: neither has an answer to file.
     */
    if (type !== "text" && type !== "signature" && type !== "lines") {
      const role = roleOf(b as { role?: unknown });
      if (role) block.role = role;
    }
    if (type === "lines") {
      const items = (Array.isArray(b.items) ? b.items : [])
        .map((raw) => {
          const it = (raw ?? {}) as Record<string, unknown>;
          return {
            name: String(it.name ?? "").trim().slice(0, 200),
            quantity: Math.max(1, Math.min(999, Math.round(Number(it.quantity) || 1))),
            pence: Math.max(0, Math.min(100_000_000, Math.round(Number(it.pence) || 0))),
          };
        })
        .filter((it) => it.name)
        .slice(0, 50);
      if (!items.length) continue;
      block.items = items;
      const by = (b.by ?? null) as { id?: unknown; name?: unknown } | null;
      if (by && typeof by.id === "string" && typeof by.name === "string" && by.name.trim()) {
        block.by = { id: by.id.slice(0, 64), name: by.name.trim().slice(0, 80) };
      }
    }
    if (type === "repeat") {
      /*
       * One level deep, and never a signature or a quote inside one.
       *
       * The depth guard is what stops a template describing a group inside a
       * group: cleanBlocks is called on the children with the same function, so
       * without it a doctored template could nest until something gave way.
       */
      const children = cleanBlocks(
        (Array.isArray(b.children) ? b.children : []).filter((c) => {
          const t = (c as { type?: unknown })?.type;
          return t !== "repeat" && t !== "signature" && t !== "lines";
        }),
      );
      if (!children.length) continue;
      block.children = children;

      const each = String(b.each ?? "").trim().slice(0, 40);
      if (each) block.each = each;
      const addLabel = String(b.addLabel ?? "").trim().slice(0, 60);
      if (addLabel) block.addLabel = addLabel;
    }

    out.push(block);
  }
  return out;
}

/** The most of anything one form will ask about. */
export const MOST_REPEATS = 6;

/** How a repeated question is keyed. The first is plain, so one dog reads as one dog. */
export const instanceId = (id: string, at: number) => (at === 0 ? id : `${id}~${at + 1}`);

/**
 * A form with its repeating groups opened out, given how many of each.
 *
 * ── Why flatten rather than teach everything about groups ───────────────────
 *
 * Six things read a form: the page that renders it, the server that validates
 * it, the one that saves it, the record, the download and the write-back. All
 * six already understand a flat list, and all six would have needed a second
 * code path for groups, which is six chances to disagree about what a form
 * says. Opening the group out once, here, means the other five never learn the
 * word.
 *
 * The first instance keeps the plain id, so a client with one dog produces
 * exactly the answers they produced before this existed, and nothing already
 * signed reads differently.
 *
 * Roles are handled the same way and it matters more. A trade fact on the
 * second dog becomes breed_2, because two dogs writing to breed would leave
 * whichever was read last. A detail about the person is only taken from the
 * first, since nobody has two names. The alert and the notes take all of them,
 * because "the second dog bites" is exactly the thing that must not be lost.
 */
export function expandRepeats(blocks: Block[], counts: Record<string, number>): Block[] {
  const out: Block[] = [];

  for (const b of blocks) {
    if (b.type !== "repeat" || !b.children?.length) {
      out.push(b);
      continue;
    }

    const asked = Math.max(1, Math.min(MOST_REPEATS, Math.round(counts[b.id] ?? 1)));
    const noun = b.each || "One";

    for (let at = 0; at < asked; at++) {
      out.push({
        id: instanceId(`${b.id}__h`, at),
        type: "text",
        label: asked > 1 ? `${noun} ${at + 1}` : noun,
      });

      for (const child of b.children) {
        const copy: Block = { ...child, id: instanceId(child.id, at) };

        if (child.role) {
          if (at === 0) copy.role = child.role;
          else if (child.role.startsWith("fact:")) copy.role = `${child.role}_${at + 1}`;
          else if (child.role === "alert" || child.role === "note") copy.role = child.role;
          else delete copy.role;
        }

        /* The label says which one it is, so the record is readable. */
        if (asked > 1) copy.label = `${noun} ${at + 1}: ${child.label}`;

        out.push(copy);
      }
    }
  }

  return out;
}

/** How many of each group a stored form was filled in for. */
export const COUNT_PREFIX = "__n_";

export function countsFrom(answers: Answers | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(answers ?? {})) {
    if (!key.startsWith(COUNT_PREFIX)) continue;
    const n = Math.round(Number(value));
    if (Number.isFinite(n) && n > 0) out[key.slice(COUNT_PREFIX.length)] = Math.min(MOST_REPEATS, n);
  }
  return out;
}

/** The key a "tell us more" answer is kept under. */
export const detailKey = (id: string) => `${id}__detail`;

/**
 * The answers out of a submitted form, keyed by block, and nothing else.
 *
 * Only the ids the form actually has are read, so a doctored submission cannot
 * add answers to questions nobody asked.
 */
export function readAnswers(blocks: Block[], get: (key: string) => string | null): Answers {
  const answers: Answers = {};
  for (const b of blocks) {
    if (b.type === "text" || b.type === "signature" || b.type === "lines") continue;
    const value = (get(`q_${b.id}`) ?? "").trim().slice(0, 5000);
    if (b.type === "agree") {
      answers[b.id] = value ? "yes" : "";
      continue;
    }
    answers[b.id] = value;
    if (b.type === "yesno" && b.detailOnYes && value === "yes") {
      answers[detailKey(b.id)] = (get(`q_${detailKey(b.id)}`) ?? "").trim().slice(0, 5000);
    }
  }
  return answers;
}

export type Signing = { name: string; signature: string | null };

const SIGNATURE_PREFIX = "data:image/png;base64,";
const MAX_SIGNATURE = 300_000;

/**
 * What is still missing, as sentences for the customer, in the order they
 * appear. Empty means the form can be accepted.
 */
export function whatIsMissing(blocks: Block[], answers: Answers, signing?: Signing): string[] {
  const missing: string[] = [];
  for (const b of blocks) {
    const value = answers[b.id] ?? "";
    if (b.type === "text" || b.type === "lines") continue;
    if (b.type === "signature") {
      if (!signing?.name?.trim()) missing.push("Type your full name under the signature.");
      if (!validSignature(signing?.signature)) missing.push("Sign in the box, or type your name to sign.");
      continue;
    }
    if (b.type === "agree" && value !== "yes") {
      missing.push(`Tick to agree: ${short(b.label)}`);
      continue;
    }
    if (b.required && !value) missing.push(`Please answer: ${short(b.label)}`);
    if (b.type === "choice" && value && !(b.options ?? []).includes(value)) {
      missing.push(`Pick one of the options for: ${short(b.label)}`);
    }
    if (b.type === "yesno" && value && value !== "yes" && value !== "no") {
      missing.push(`Answer yes or no: ${short(b.label)}`);
    }
    if (b.type === "date" && value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      missing.push(`Use a date for: ${short(b.label)}`);
    }
  }
  return missing;
}

/**
 * What a typed signature looks like on the record.
 *
 * A drawn signature is a PNG; this is the other way of signing, for somebody
 * who cannot draw one. Kept as a distinct, recognisable string so that neither
 * the form nor anybody reading it later can mistake one for the other — what
 * matters evidentially is that a person took a deliberate act to sign, and
 * typing your own name in a box that says so is exactly that.
 */
export const TYPED_SIGNATURE = "typed:";

/** A typed signature: the prefix, and the name they typed. */
export function typedSignature(name: string): string {
  return `${TYPED_SIGNATURE}${name.trim()}`;
}

export function isTypedSignature(signature: string | null | undefined): boolean {
  return Boolean(signature?.startsWith(TYPED_SIGNATURE) && signature.slice(TYPED_SIGNATURE.length).trim().length >= 2);
}

export function validSignature(signature: string | null | undefined): boolean {
  /*
   * Drawn or typed.
   *
   * The signature box is a canvas driven by pointer events: not focusable, no
   * keyboard path, and required. A keyboard-only or screen-reader user could
   * not complete a consent form or accept a quote at all — on a document that
   * is legally operative, which is the worst place in the product for a thing
   * that cannot be done without a mouse.
   */
  if (isTypedSignature(signature)) return true;

  return Boolean(
    signature &&
      signature.startsWith(SIGNATURE_PREFIX) &&
      signature.length > SIGNATURE_PREFIX.length + 200 &&
      signature.length <= MAX_SIGNATURE &&
      /^[A-Za-z0-9+/=]+$/.test(signature.slice(SIGNATURE_PREFIX.length)),
  );
}

export function needsSignature(blocks: Block[]): boolean {
  return blocks.some((b) => b.type === "signature");
}

/** How an answer reads on the record: "Yes — eczema on both wrists". */
export function answerText(block: Block, answers: Answers | null | undefined): string {
  const value = answers?.[block.id] ?? "";
  if (block.type === "agree") return value === "yes" ? "Agreed" : "Not agreed";
  if (block.type === "yesno") {
    if (!value) return "—";
    const detail = answers?.[detailKey(block.id)];
    return value === "yes" ? (detail ? `Yes — ${detail}` : "Yes") : "No";
  }
  if (block.type === "date" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  }
  return value || "—";
}

/**
 * Answers worth somebody's attention before they start: a "yes" to a health
 * question, which is almost always what a questionnaire is for.
 */
export function flagged(blocks: Block[], answers: Answers | null | undefined): Block[] {
  return blocks.filter((b) => b.type === "yesno" && answers?.[b.id] === "yes");
}

function short(label: string): string {
  const one = label.replace(/\s+/g, " ").trim();
  return one.length > 70 ? `${one.slice(0, 67)}…` : one;
}

/** What a quote comes to, across every priced list in it. */
export function quoteTotal(blocks: Block[]): number {
  return blocks
    .filter((b) => b.type === "lines")
    .reduce((sum, b) => sum + (b.items ?? []).reduce((n, it) => n + it.quantity * it.pence, 0), 0);
}
