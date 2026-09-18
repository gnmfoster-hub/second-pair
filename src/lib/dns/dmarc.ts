/**
 * Reading a DMARC record, and saying what is wrong with it.
 *
 * Written because the health check asked whether the record contained the
 * letters "v=DMARC" and said ok. The record it said ok to was this:
 *
 *   v=DMARC1; p=none; rua=mailto:v=DMARC1; p=none; pct=100;
 *   rua=mailto:re+d2qbkrbdswd@dmarc.postmarkapp.com; sp=none;
 *   aspf=r;@inbox.dmarcdigests.com,mailto:info@second-pair.com
 *
 * A whole new record pasted into the middle of the old one's rua field, so the
 * reporting address became "v=DMARC1; p=none; …" and the rest of the record
 * became tags nobody asked for and a fragment with no tag name at all. The
 * check truncated it at forty-eight characters, which is exactly long enough
 * to look fine.
 *
 * The same fault as everywhere else: asking whether a thing is there instead
 * of whether it can be used.
 *
 * This is deliberately not a full RFC 7489 parser. It answers the questions
 * that matter to somebody running one small business's mail: is the record
 * well formed, will it be honoured, where are the reports going, and is the
 * daily flood of XML going to a person's inbox.
 */

export type Dmarc = {
  /** The tags that parsed, first occurrence winning, as a receiver would. */
  tags: Record<string, string>;
  /** Everything wrong enough that a receiver may ignore the whole record. */
  faults: string[];
  /** Worth saying, but the record still works. */
  notes: string[];
  /** Addresses aggregate reports are sent to. */
  reportTo: string[];
};

/** A reporting address: `mailto:` and something that looks like an address. */
const MAILTO = /^mailto:[^\s@]+@[^\s@;,]+\.[^\s@;,]+$/i;

/** Tags DMARC defines. Anything else is either a typo or somebody's paste. */
const KNOWN = new Set(["v", "p", "sp", "rua", "ruf", "pct", "adkim", "aspf", "fo", "rf", "ri"]);

export function readDmarc(record: string): Dmarc {
  const faults: string[] = [];
  const notes: string[] = [];
  const tags: Record<string, string> = {};
  const seen = new Set<string>();

  const parts = record
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean);

  for (const part of parts) {
    const at = part.indexOf("=");
    if (at === -1) {
      /*
       * A fragment with no tag name at all.
       *
       * This is what the tail of a pasted-over record looks like:
       * "@inbox.dmarcdigests.com,mailto:info@second-pair.com" left stranded
       * after the tags that swallowed its beginning.
       */
      faults.push(`"${part}" is not a tag — it has no name`);
      continue;
    }

    const name = part.slice(0, at).trim().toLowerCase();
    const value = part.slice(at + 1).trim();

    if (seen.has(name)) {
      // Two of the same tag means two records have been mixed together.
      faults.push(`${name} appears twice — two records have been run into one`);
      continue;
    }
    seen.add(name);

    if (!KNOWN.has(name)) notes.push(`${name} is not a DMARC tag`);
    tags[name] = value;
  }

  if (tags.v?.toUpperCase() !== "DMARC1") {
    faults.push('it must start with "v=DMARC1"');
  } else if (parts[0]?.trim().toLowerCase().replace(/\s/g, "") !== "v=dmarc1") {
    faults.push('"v=DMARC1" has to be the first thing in the record');
  }

  if (!tags.p) faults.push("there is no p= policy");
  else if (!["none", "quarantine", "reject"].includes(tags.p.toLowerCase())) {
    faults.push(`p=${tags.p} is not a policy — it must be none, quarantine or reject`);
  }

  const reportTo: string[] = [];
  if (tags.rua) {
    for (const uri of tags.rua.split(",").map((u) => u.trim())) {
      if (MAILTO.test(uri)) reportTo.push(uri.slice("mailto:".length));
      else faults.push(`"${uri}" is not a reporting address`);
    }
  } else {
    notes.push("no rua, so no reports are sent anywhere");
  }

  return { tags, faults, notes, reportTo };
}

/**
 * Is a reporting address a person's inbox rather than a service's?
 *
 * The reason to care is volume, not correctness. Every receiver that honours
 * DMARC sends one aggregate report a day per domain, as an XML attachment, to
 * every address named — so a real mailbox in here means Google, Microsoft,
 * Yahoo and the rest all posting unreadable files into somebody's inbox every
 * morning, for ever. The services exist to swallow that and send one readable
 * summary a week instead.
 *
 * Judged by the domain rather than the local part: the report processors all
 * publish their own, and anything else is somebody's own mail.
 */
const PROCESSORS = [
  "dmarcdigests.com",
  "dmarcian.com",
  "postmarkapp.com",
  "dmarcanalyzer.com",
  "valimail.com",
  "easydmarc.com",
  "mxtoolbox.com",
  "agari.com",
  "fraudmarc.com",
  "ondmarc.com",
  "uriports.com",
  "reportmarc.com",
];

export function isAPersonsInbox(address: string): boolean {
  const domain = address.split("@")[1]?.toLowerCase() ?? "";
  return !PROCESSORS.some((p) => domain === p || domain.endsWith(`.${p}`));
}
