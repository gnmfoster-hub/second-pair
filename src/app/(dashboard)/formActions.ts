"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireStudio, requireOwner } from "@/lib/studio";
import { createClient } from "@/lib/supabase/server";
import { siteOrigin } from "@/lib/origin";
import { canMessage } from "@/lib/permissions";
import { routesFor } from "@/lib/messaging/reach";
import { connectedChannels, smsNumberFor } from "@/lib/messaging/connections";
import { deliver } from "@/lib/messaging/deliver";
import { replyToFor } from "@/lib/messaging/replyTo";
import { cleanBlocks, quoteTotal, type QuoteLine } from "@/lib/forms/blocks";
import { formatPence, parsePounds } from "@/lib/money";
import { starter } from "@/lib/forms/starters";
import type { Channel } from "@/lib/types";

export type FormActionState = {
  error?: string;
  ok?: boolean;
  /** How many went, when several were sent at once. */
  sent?: number;
  /** Who could not be reached, by name, so somebody can ring them. */
  unreached?: string[];
  /** The private link, when one form was made — to copy or open at the desk. */
  url?: string;
  note?: string;
};

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();

/** Said once, wherever the tables are not there yet. */
const NOT_YET = "Forms need a database update before they can be used — it is on the list.";

const KINDS = new Set(["consent", "questionnaire", "waiver", "quote", "other"]);

// ───────────────────────────────────────────────────────────── templates

/**
 * Save a form the business writes.
 *
 * The owner's, because a consent form is the business's word to its
 * customers. The questions arrive as JSON from the editor and are cleaned, not
 * trusted: the page that shows them is opened by anybody with a link.
 */
export async function saveTemplate(_prev: FormActionState, fd: FormData): Promise<FormActionState> {
  const { studio } = await requireOwner();
  const supabase = await createClient();

  const name = str(fd, "name");
  if (!name) return { error: "Give the form a name." };

  let blocks;
  try {
    blocks = cleanBlocks(JSON.parse(str(fd, "blocks") || "[]"));
  } catch {
    return { error: "The questions could not be read. Try again." };
  }
  if (!blocks.some((b) => b.type !== "text")) {
    return { error: "Add at least one question, a tick to agree, or a signature." };
  }

  const kind = KINDS.has(str(fd, "kind")) ? str(fd, "kind") : "consent";
  const id = str(fd, "id");
  const row = { name: name.slice(0, 120), kind, blocks, updated_at: new Date().toISOString() };

  const { error } = id
    ? await supabase.from("form_templates").update(row).eq("id", id).eq("studio_id", studio.id)
    : await supabase.from("form_templates").insert({ ...row, studio_id: studio.id });

  if (error) return { error: /relation|does not exist/i.test(error.message) ? NOT_YET : error.message };

  revalidatePath("/settings/forms");
  return { ok: true };
}

/** Start from one of ours. Copied, so the business edits its own. */
export async function addStarter(_prev: FormActionState, fd: FormData): Promise<FormActionState> {
  const { studio } = await requireOwner();
  const supabase = await createClient();

  const chosen = starter(str(fd, "starter"));
  if (!chosen) return { error: "That starter form does not exist." };

  const { error } = await supabase.from("form_templates").insert({
    studio_id: studio.id,
    name: chosen.name,
    kind: chosen.kind,
    blocks: chosen.blocks,
    starter: chosen.key,
  });
  if (error) return { error: /relation|does not exist/i.test(error.message) ? NOT_YET : error.message };

  revalidatePath("/settings/forms");
  return { ok: true, note: `${chosen.name} added. Edit the wording to make it yours.` };
}

/**
 * Take a form off the list.
 *
 * Retired rather than deleted: every copy already sent points back at it, and
 * those signed copies are records the business must keep.
 */
export async function retireTemplate(_prev: FormActionState, fd: FormData): Promise<FormActionState> {
  const { studio } = await requireOwner();
  const supabase = await createClient();

  const { error } = await supabase
    .from("form_templates")
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq("id", str(fd, "id"))
    .eq("studio_id", studio.id);
  if (error) return { error: error.message };

  revalidatePath("/settings/forms");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────── sending

type Recipient = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  prefers?: string | null;
  conversations: { id: string; channel: string; external_ref: string | null; last_inbound_at: string | null }[] | null;
};

/**
 * Send a form to one person or to several.
 *
 * Each gets their own copy with the questions frozen as they are now, and a
 * private link that works for thirty days. It goes the way they can be
 * reached — the way they asked for, then a text, then an email — or, with
 * "just the link", it is made and handed back for somebody at the desk to
 * open on the spot.
 *
 * Several at once is the whole list in one go: everybody booked in on
 * Saturday for a consent form, every regular for updated terms. Whoever
 * cannot be reached is named, rather than counted, so they can be rung.
 */
export async function sendForm(_prev: FormActionState, fd: FormData): Promise<FormActionState> {
  const { studio, userId } = await requireStudio();
  const supabase = await createClient();

  const templateId = str(fd, "template_id");
  if (!templateId) return { error: "Pick a form to send." };

  const contactIds = [...new Set(fd.getAll("contact_id").map((v) => String(v).trim()).filter(Boolean))];
  if (!contactIds.length) return { error: "Pick who to send it to." };
  if (contactIds.length > 200) return { error: "That is more than 200 people at once. Send it in smaller groups." };

  const how = str(fd, "send_on") as Channel | "auto" | "";
  const bookingId = str(fd, "booking_id") || null;

  const { data: template, error: tError } = await supabase
    .from("form_templates")
    .select("id, name, blocks, active")
    .eq("id", templateId)
    .eq("studio_id", studio.id)
    .maybeSingle();
  if (tError) return { error: /relation|does not exist/i.test(tError.message) ? NOT_YET : tError.message };
  if (!template || !template.active) return { error: "That form is not available any more." };

  return deliverCopies({
    studio,
    userId,
    supabase,
    contactIds,
    how,
    bookingId,
    copy: {
      templateId: template.id as string,
      title: template.name as string,
      blocks: template.blocks,
      subject: `${template.name} — ${studio.name}`,
      message: (firstName, url) =>
        `${firstName ? `Hi ${firstName}, ` : ""}${studio.name} has a form for you to fill in: ` +
        `${template.name}. It takes a couple of minutes — ${url}`,
    },
  });
}

type Copy = {
  templateId: string | null;
  title: string;
  blocks: unknown;
  subject: string;
  message: (firstName: string, url: string) => string;
  expiresInDays?: number;
};

/**
 * One copy each, made and sent.
 *
 * Shared by forms and quotes: both are a frozen copy with a private link,
 * delivered the way each person can be reached, and both name whoever could
 * not be reached rather than counting them.
 */
async function deliverCopies({
  studio,
  userId,
  supabase,
  contactIds,
  how,
  bookingId,
  copy,
}: {
  studio: Awaited<ReturnType<typeof requireStudio>>["studio"];
  userId: string;
  supabase: Awaited<ReturnType<typeof createClient>>;
  contactIds: string[];
  how: Channel | "auto" | "";
  bookingId: string | null;
  copy: Copy;
}): Promise<FormActionState> {
  const { data: people } = await supabase
    .from("contacts")
    .select("*, conversations(id, channel, external_ref, last_inbound_at)")
    .eq("studio_id", studio.id)
    .in("id", contactIds);

  const recipients = (people ?? []) as Recipient[];
  if (!recipients.length) return { error: "None of those people are in this business." };

  const messaging = how === "" ? false : await canMessage();
  if (how !== "" && !messaging) {
    return { error: "You cannot message customers from this login. Use “Just make the link” and hand it over." };
  }

  const origin = await siteOrigin();
  const connected = await connectedChannels(supabase, studio.id);
  const smsFrom = await smsNumberFor(supabase, studio.id);
  const expires = new Date(Date.now() + (copy.expiresInDays ?? 30) * 86_400_000).toISOString();

  let sent = 0;
  let lastUrl: string | undefined;
  const unreached: string[] = [];

  for (const person of recipients) {
    const token = randomBytes(24).toString("base64url");
    const url = `${origin}/f/${token}`;
    const firstName = (person.name ?? "").split(" ")[0];

    // Where it goes, decided before the copy is made so a failed send is not a sent form.
    let route: { channel: Channel; to: string; lastInboundAt?: string | null } | null = null;
    if (how !== "") {
      const routes = routesFor({
        conversations: (person.conversations ?? []) as never,
        phone: person.phone,
        email: person.email,
        prefers: (person.prefers ?? null) as "sms" | "email" | null,
        connected,
      }).filter((r) => r.open && r.channel !== "web");
      const pick = how === "auto" ? routes[0] : routes.find((r) => r.channel === how);
      if (pick) route = { channel: pick.channel, to: pick.to, lastInboundAt: pick.lastInboundAt };
      // The demo pretends, and only to the two kinds a real business would have.
      if (!route && studio.kind === "demo") {
        if ((how === "auto" || how === "sms") && person.phone) route = { channel: "sms", to: person.phone };
        else if ((how === "auto" || how === "email") && person.email) route = { channel: "email", to: person.email };
      }
      if (!route) {
        unreached.push(person.name ?? person.phone ?? person.email ?? "Somebody unnamed");
        continue;
      }
    }

    const { data: made, error } = await supabase
      .from("client_forms")
      .insert({
        studio_id: studio.id,
        contact_id: person.id,
        template_id: copy.templateId,
        booking_id: contactIds.length === 1 ? bookingId : null,
        title: copy.title,
        blocks: copy.blocks,
        status: "sent",
        token,
        expires_at: expires,
        sent_via: route?.channel ?? "link",
        sent_at: new Date().toISOString(),
        created_by: userId,
      })
      .select("id")
      .single();

    if (error || !made) {
      return { error: /relation|does not exist/i.test(error?.message ?? "") ? NOT_YET : (error?.message ?? "Could not make the form.") };
    }

    if (route && studio.kind !== "demo") {
      const body = copy.message(firstName, url);
      const delivered = await deliver({
        channel: route.channel,
        to: route.to,
        body,
        lastInboundAt: route.lastInboundAt ?? null,
        from: route.channel === "sms" ? smsFrom : undefined,
        subject: copy.subject,
        fromName: studio.name,
        replyTo: replyToFor(studio),
      });
      if (delivered.status === "failed") {
        // The copy stays, so the link can still be given another way.
        unreached.push(person.name ?? route.to);
        lastUrl = url;
        continue;
      }
    }

    sent += 1;
    lastUrl = url;
    revalidatePath(`/clients/${person.id}`);
  }

  revalidatePath("/clients/forms");

  return {
    ok: true,
    sent,
    unreached,
    url: recipients.length === 1 ? lastUrl : undefined,
    note:
      studio.kind === "demo" && how !== ""
        ? "Demo: nothing was really sent. Open the link to fill it in as the customer would."
        : undefined,
  };
}

/** Stop a link working and take the form off their list. The copy is kept. */
export async function voidForm(_prev: FormActionState, fd: FormData): Promise<FormActionState> {
  const { studio } = await requireStudio();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("client_forms")
    .update({ status: "void", token: null, updated_at: new Date().toISOString() })
    .eq("id", str(fd, "id"))
    .eq("studio_id", studio.id)
    .neq("status", "signed")
    .select("contact_id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "A signed form cannot be withdrawn — it is a record of what they agreed." };

  revalidatePath(`/clients/${data[0].contact_id}`);
  return { ok: true };
}

/** The business's forms, for a picker opened on demand. Empty before forms exist. */
export async function listFormTemplates(): Promise<{ id: string; name: string }[]> {
  const { studio } = await requireStudio();
  const supabase = await createClient();
  const { data } = await supabase
    .from("form_templates")
    .select("id, name")
    .eq("studio_id", studio.id)
    .eq("active", true)
    .order("sort_order")
    .order("created_at");
  return (data ?? []).map((t) => ({ id: t.id as string, name: t.name as string }));
}

/**
 * A quote, priced line by line, for the customer to accept and sign.
 *
 * Built here rather than from a template, because the prices are this job's
 * and nobody else's. It carries its own frozen lines, a valid-until date, a
 * tick to accept and a signature — so an accepted quote is a record of exactly
 * what was agreed at exactly what price.
 */
export async function sendQuote(_prev: FormActionState, fd: FormData): Promise<FormActionState> {
  const { studio, userId } = await requireStudio();
  const supabase = await createClient();

  const contactId = str(fd, "contact_id");
  if (!contactId) return { error: "Who is the quote for?" };

  const items: QuoteLine[] = [];
  for (let i = 0; i < 30; i++) {
    const name = str(fd, `line_name_${i}`);
    const price = parsePounds(fd.get(`line_price_${i}`));
    if (!name && price == null) continue;
    if (!name) return { error: `Line ${i + 1} has a price but no description.` };
    if (price == null || price < 0) return { error: `Put a price on "${name}".` };
    items.push({ name, quantity: Math.max(1, Math.round(Number(str(fd, `line_qty_${i}`)) || 1)), pence: price });
  }
  if (!items.length) return { error: "Add at least one line to the quote." };

  // Who is giving the quote, if anybody was chosen. Checked against this business.
  let by: { id: string; name: string } | undefined;
  const byId = str(fd, "by_artist_id");
  if (byId) {
    const { data: person } = await supabase
      .from("artists")
      .select("id, name")
      .eq("id", byId)
      .eq("studio_id", studio.id)
      .maybeSingle();
    if (!person) return { error: "That person is not in this business." };
    by = { id: person.id as string, name: person.name as string };
  }

  const validDays = Math.min(90, Math.max(1, Number(str(fd, "valid_days")) || 30));
  const until = new Date(Date.now() + validDays * 86_400_000).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: studio.timezone ?? "Europe/London",
  });
  const note = str(fd, "note").slice(0, 2000);

  const blocks = cleanBlocks([
    {
      id: "intro",
      type: "text",
      label: `Here is your quote from ${by ? `${by.name} at ` : ""}${studio.name}.${note ? `

${note}` : ""}`,
    },
    { id: "lines", type: "lines", label: "The quote", items, ...(by ? { by } : {}) },
    {
      id: "valid",
      type: "text",
      label: `This quote is valid until ${until}.${studio.vat_registered ? (studio.prices_include_vat ? " Prices include VAT." : " VAT is added to these prices.") : ""}`,
    },
    { id: "accept", type: "agree", label: "I accept this quote." },
    { id: "sign", type: "signature", label: "Signature" },
  ]);
  const total = quoteTotal(blocks);

  return deliverCopies({
    studio,
    userId,
    supabase,
    contactIds: [contactId],
    how: str(fd, "send_on") as Channel | "auto" | "",
    bookingId: str(fd, "booking_id") || null,
    copy: {
      templateId: null,
      title: `Quote — ${formatPence(total)}`,
      blocks,
      subject: `Your quote from ${studio.name} — ${formatPence(total)}`,
      message: (firstName, url) =>
        `${firstName ? `Hi ${firstName}, ` : ""}here is your quote from ${by ? `${by.name.split(" ")[0]} at ` : ""}${studio.name}: ${formatPence(total)}. ` +
        `You can read it and accept it here — ${url}`,
      expiresInDays: validDays,
    },
  });
}
