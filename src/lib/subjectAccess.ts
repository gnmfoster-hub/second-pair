/**
 * Everything a business holds about one person, as something they can read.
 *
 * A member of the public can ask for a copy of their data, and the business
 * has a month to provide it. There was no way to produce one, so a salon
 * receiving that request had to go through a database by hand or refuse.
 *
 * Written as a plain document rather than exported as JSON. The right is to
 * receive it in an intelligible form: JSON is complete and unreadable, and
 * handing somebody a file of braces in answer to "what do you know about me"
 * is a technically compliant way of not really answering. This is a letter
 * they can read, forward, or print.
 */

export type SubjectRecord = {
  business: string;
  askedOn: Date;
  contact: {
    name: string | null;
    phone: string | null;
    email: string | null;
    instagram_handle: string | null;
    marketing_consent: boolean | null;
    notes: string | null;
    created_at: string | null;
  };
  conversations: {
    channel: string | null;
    created_at: string | null;
    messages: { role: string; content: string; created_at: string }[];
  }[];
  bookings: {
    starts_at: string;
    ends_at: string;
    type: string | null;
    with: string | null;
    cancelled_at: string | null;
  }[];
};

const when = (iso: string | null, timezone: string): string => {
  if (!iso) return "unknown";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(iso));
};

const said = (role: string, business: string): string => {
  if (role === "client") return "You";
  if (role === "owner") return business;
  if (role === "assistant") return `${business}'s assistant`;
  return "System note";
};

export function subjectAccessDocument(record: SubjectRecord, timezone: string): string {
  const out: string[] = [];
  const rule = "-".repeat(64);

  out.push(`What ${record.business} holds about you`);
  out.push(`Prepared ${when(record.askedOn.toISOString(), timezone)}`);
  out.push("");
  out.push(
    "This is everything held about you by this business. If anything here is wrong",
    "you can ask them to correct it, and you can ask them to delete all of it.",
  );

  out.push("", rule, "YOUR DETAILS", rule, "");
  const c = record.contact;
  const details: [string, string | null][] = [
    ["Name", c.name],
    ["Phone", c.phone],
    ["Email", c.email],
    ["Instagram", c.instagram_handle],
    ["First recorded", c.created_at ? when(c.created_at, timezone) : null],
    [
      "Marketing",
      c.marketing_consent == null
        ? null
        : c.marketing_consent
          ? "You agreed to hear about offers"
          : "You have not agreed to marketing",
    ],
  ];
  for (const [label, value] of details) {
    if (value) out.push(`${label.padEnd(16)}${value}`);
  }

  /*
   * Their private notes are included, and that is deliberate.
   *
   * A note a business wrote about somebody is personal data about that person,
   * and the right of access covers it whether or not it is flattering. Leaving
   * it out because it is awkward is the reason the right exists.
   */
  if (c.notes?.trim()) {
    out.push("", "Notes this business has kept about you:", "", ...c.notes.split("\n").map((l) => `  ${l}`));
  }

  out.push("", rule, "CONVERSATIONS", rule);
  if (!record.conversations.length) {
    out.push("", "There are none recorded.");
  }
  for (const conv of record.conversations) {
    out.push("", `${conv.channel ?? "website"} — ${when(conv.created_at, timezone)}`, "");
    if (!conv.messages.length) out.push("  (nothing was said)");
    for (const m of conv.messages) {
      out.push(`  ${said(m.role, record.business)} · ${when(m.created_at, timezone)}`);
      for (const line of m.content.split("\n")) out.push(`    ${line}`);
      out.push("");
    }
  }

  out.push(rule, "APPOINTMENTS", rule);
  if (!record.bookings.length) {
    out.push("", "There are none recorded.");
  }
  for (const b of record.bookings) {
    const withWhom = b.with ? ` with ${b.with}` : "";
    const off = b.cancelled_at ? "  (cancelled)" : "";
    out.push("", `${when(b.starts_at, timezone)}${withWhom}${off}`);
  }

  out.push("", rule, "");
  out.push(
    "Prepared by Second Pair on behalf of the business named above, which decides",
    "what is kept and why. Ask them if you want anything corrected or removed.",
  );

  return out.join("\n");
}
