import type { SupabaseClient } from "@supabase/supabase-js";
import {
  cleanBlocks,
  answerText,
  expandRepeats,
  countsFrom,
  type Block,
  type Answers,
} from "./blocks";
import { whatToSave, type Known } from "./fieldRoles";
import { hasColumn } from "@/lib/db/hasColumn";
import { sendEmail, emailConfigured } from "@/lib/messaging/email";
import { buildEmail } from "@/lib/messaging/emailTemplate";
import { avatarUrl } from "@/components/Avatar";
import { siteOrigin } from "@/lib/origin";

/**
 * Everything that happens once a customer has signed.
 *
 * Until 5 October a signed form did three things: it wrote one row, and that
 * was all three. The answers sat in a jsonb blob nothing could read, the client
 * record was untouched however much the form had just learned, and nobody was
 * told. The business found out by happening to look at a screen, and the
 * customer who had just filled in four pages could never see what they signed
 * again, because the link turns into "Already done, thank you".
 *
 * Giles asked for the other three quarters: fill the record in, send the
 * customer a copy, and tell the business it is in the file.
 *
 * ── Nothing in here may fail the submit ─────────────────────────────────────
 *
 * It is called after the form is saved and inside a try that swallows, and that
 * is deliberate. The customer has done the work; the form is signed and stored.
 * An email provider having a bad afternoon must never turn into somebody being
 * asked to fill it all in again.
 */

type FormRow = {
  id: string;
  studio_id: string;
  contact_id: string;
  title: string;
  blocks: unknown;
  answers: Answers | null;
  signed_at: string | null;
  signer_name: string | null;
};

export async function fileItAway(db: SupabaseClient, formId: string): Promise<void> {
  const { data } = await db
    .from("client_forms")
    .select("id, studio_id, contact_id, title, blocks, answers, signed_at, signer_name")
    .eq("id", formId)
    .maybeSingle();

  const form = data as FormRow | null;
  if (!form) return;

  const answers = form.answers ?? {};

  /*
   * Opened out before anything reads it.
   *
   * Without this the roles are still sitting inside the repeating group, where
   * nothing looks: a form filled in for three dogs wrote not one breed and not
   * one alert, and said nothing about it, because the only block at the top
   * level was the group itself and a group has no answer. Found by filling one
   * in for three dogs rather than by reading this.
   */
  const blocks = expandRepeats(cleanBlocks(form.blocks), countsFrom(answers));

  const [{ data: studio }, known] = await Promise.all([
    db
      .from("studios")
      .select("name, email, photo_path")
      .eq("id", form.studio_id)
      .maybeSingle(),
    whatWeHold(db, form.contact_id),
  ]);

  const business = (studio?.name as string) ?? "your business";

  /* ---------------------------------------------------------- the record */

  const save = whatToSave(blocks, answers, known);
  const patch: Record<string, string> = { ...save.person };
  if (save.alert) patch.alert = save.alert;
  if (save.notes) patch.notes = save.notes;

  /*
   * Address and postcode arrive with a migration, so they are dropped from the
   * write until the column answers. Sending a column PostgREST has not heard of
   * refuses the whole update, which would lose the name and the phone number
   * with it.
   */
  if (!(await hasColumn(db, "contacts", "address"))) {
    delete patch.address;
    delete patch.postcode;
  }

  if (Object.keys(patch).length) {
    await db.from("contacts").update(patch).eq("id", form.contact_id);
  }

  /*
   * Facts merged rather than replaced. A form that asks about vaccinations must
   * not wipe the breed somebody typed in during a conversation in August.
   */
  if (Object.keys(save.facts).length && (await hasColumn(db, "contacts", "trade_facts"))) {
    await db
      .from("contacts")
      .update({ trade_facts: { ...(known.facts ?? {}), ...save.facts } })
      .eq("id", form.contact_id);
  }

  /* ---------------------------------------------------------- the copies */

  if (!emailConfigured()) return;

  const theirEmail = (save.person.email ?? known.email ?? "").trim();
  const photoUrl = avatarUrl((studio as { photo_path?: string | null } | null)?.photo_path);

  const written = readable(blocks, answers);
  const whenSigned = form.signed_at
    ? new Date(form.signed_at).toLocaleString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })
    : "just now";

  /*
   * Theirs first. It is the one with a deadline on it in the sense that
   * matters: they have just pressed submit and the page has told them it is
   * done, so a copy arriving a minute later is what makes that true.
   */
  if (theirEmail) {
    await sendEmail({
      to: theirEmail,
      subject: `Your copy of ${form.title}`,
      fromName: business,
      replyTo: (studio?.email as string) || undefined,
      text: [
        `Thank you. ${business} has your completed ${form.title.toLowerCase()}.`,
        "",
        "Here is what you told us, for your records.",
        "",
        written,
        "",
        `Signed ${whenSigned}${form.signer_name ? ` by ${form.signer_name}` : ""}.`,
        "",
        "If anything here is wrong, or anything changes, reply to this email and we will put it right.",
      ].join("\n"),
      html: buildEmail({
        business,
        heading: "Thank you, that is all done",
        photoUrl,
        body:
          `${business} has your completed ${form.title.toLowerCase()}. Here is what you told us, ` +
          `for your own records. If anything changes, reply to this email and we will put it right.`,
        details: shownAsRows(blocks, answers),
        policy: `Signed ${whenSigned}${form.signer_name ? ` by ${form.signer_name}` : ""}.`,
      }),
    }).catch(() => {
      /* Their copy failing must not stop the business being told. */
    });
  }

  /* ------------------------------------------------- and the business's */

  const toBusiness = (studio?.email as string) ?? "";
  if (!toBusiness) return;

  const who = known.name?.trim() || form.signer_name?.trim() || "A client";
  const record = `${siteOrigin()}/clients/${form.contact_id}`;

  const landed = [
    ...Object.keys(save.person).map((k) => theWord(k)),
    ...Object.keys(save.facts).map((k) => k.replace(/_/g, " ")),
  ];

  await sendEmail({
    to: toBusiness,
    subject: `${who} has completed ${form.title}`,
    fromName: "Second Pair",
    text: [
      `${who} filled in ${form.title} ${whenSigned.toLowerCase()}.`,
      "",
      `It is on their client record in Second Pair, with their signature:`,
      record,
      "",
      landed.length
        ? `Their record was updated from it: ${landed.join(", ")}.`
        : "Nothing on their record needed changing.",
      theirEmail ? `\nA copy has gone to them at ${theirEmail}.` : "\nThey have no email on file, so no copy could be sent to them.",
      "",
      "What they said:",
      "",
      written,
    ].join("\n"),
    html: buildEmail({
      business,
      heading: `${who} has completed ${form.title}`,
      body:
        `Filled in ${whenSigned.toLowerCase()}. It is on their client record with their signature, ` +
        `and you can read or download it from there.` +
        (landed.length ? ` Their record was updated from it: ${landed.join(", ")}.` : "") +
        (theirEmail ? ` A copy has gone to them.` : ` They have no email on file, so they have no copy.`),
      details: shownAsRows(blocks, answers),
      action: { label: "Open their record", url: record },
    }),
  }).catch(() => {
    /* Nothing more to do. The form is signed and on the record either way. */
  });
}

/** Their answers as plain text, for the copy. */
function readable(blocks: Block[], answers: Answers): string {
  return blocks
    .filter((b) => b.type !== "text" && b.type !== "signature" && b.type !== "lines")
    .map((b) => `${b.label.replace(/[:\s]+$/, "")}: ${answerText(b, answers)}`)
    .join("\n");
}

/**
 * The same thing as rows for the email table, capped.
 *
 * A dog walking form runs to forty questions and an email with forty rows in it
 * is not read by anybody. The first dozen, and the record has the rest.
 */
function shownAsRows(blocks: Block[], answers: Answers): { label: string; value: string }[] {
  return blocks
    .filter((b) => b.type !== "text" && b.type !== "signature" && b.type !== "lines")
    .filter((b) => (answers[b.id] ?? "").trim())
    .slice(0, 12)
    .map((b) => ({ label: b.label.replace(/[:\s]+$/, "").slice(0, 60), value: answerText(b, answers) }));
}

/** A column name as a person would say it. */
function theWord(key: string): string {
  const said: Record<string, string> = {
    name: "their name",
    phone: "their mobile",
    email: "their email",
    address: "their address",
    postcode: "their postcode",
  };
  return said[key] ?? key;
}

/** What we hold about somebody, read tolerantly. See the form page for why. */
async function whatWeHold(db: SupabaseClient, contactId: string): Promise<Known> {
  const { data } = await db
    .from("contacts")
    .select("name, phone, email, alert, notes, trade_facts")
    .eq("id", contactId)
    .maybeSingle();

  const person = (data ?? {}) as Known & { trade_facts?: Record<string, string> | null };
  const known: Known = {
    name: person.name,
    phone: person.phone,
    email: person.email,
    alert: person.alert,
    notes: person.notes,
    facts: person.trade_facts ?? null,
  };

  if (await hasColumn(db, "contacts", "address")) {
    const { data: more } = await db
      .from("contacts")
      .select("address, postcode")
      .eq("id", contactId)
      .maybeSingle();
    known.address = (more as { address?: string | null } | null)?.address ?? null;
    known.postcode = (more as { postcode?: string | null } | null)?.postcode ?? null;
  }

  return known;
}
