import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formNeeded } from "./required.ts";
/*
 * Relative and with the extension, so node can load this file.
 *
 * It read "@/lib/db/hasColumn", which the bundler resolves and node does not —
 * so the one module that decides whether a customer gets a patch test could
 * not be loaded by a script and exercised against the real database. Its
 * logic has tests; the join between that logic and the rows underneath it was
 * the part nobody could run.
 *
 * The convention already exists in here: pure libraries import each other
 * relatively, with the extension, exactly so they stay runnable outside Next.
 */
import { hasColumn } from "../db/hasColumn.ts";

/**
 * The form a new booking needs, made and handed back as a link.
 *
 * Called when the assistant books somebody in. Rather than sending a second
 * message from somewhere else, the link goes back to the assistant, which puts
 * it in the reply it is already writing — on the same channel, in the same
 * conversation, at the moment the customer is paying attention.
 *
 * Nothing happens unless the service asks for a form and this person has not
 * already signed it this year or been sent one they have not finished; in
 * that last case the same link is given again rather than a second copy.
 * Never throws: a booking is never held up by a form.
 */
export async function formForBooking(
  db: SupabaseClient,
  args: {
    studioId: string;
    contactId: string;
    bookingId: string;
    serviceId: string | null;
    title: string | null;
    origin: string;
    /** Whose appointment it is, so their own requirement can apply. */
    artistId?: string | null;
  },
): Promise<{ name: string; url: string } | null> {
  try {
    /*
     * The business's requirements, and the reason it gives for them.
     *
     * form_reason is asked for only once its column exists. PostgREST refuses
     * a whole query for one unknown name, and a deploy that arrives before its
     * migration would therefore stop every form being sent rather than lose
     * one optional sentence.
     */
    const explains = await hasColumn(db, "services", "form_reason");
    const { data: services } = await db
      .from("services")
      .select(explains ? "id, name, requires_form_id, form_reason" : "id, name, requires_form_id")
      .eq("studio_id", args.studioId);

    /*
     * What the person doing the work asks for on top.
     *
     * One stylist wants a patch test before every colour; the one at the next
     * chair asks at the consultation. Guarded the same way, and skipped
     * entirely when nobody is named — a business with one diary has nobody to
     * differ from.
     */
    const personal =
      args.artistId && (await hasColumn(db, "service_people", "requires_form_id"))
        ? ((
            await db
              .from("service_people")
              .select("service_id, artist_id, requires_form_id, form_reason")
              .eq("artist_id", args.artistId)
              .not("requires_form_id", "is", null)
          ).data ?? [])
        : [];

    const wanted = (services ?? []) as unknown as {
      id: string;
      name: string;
      requires_form_id: string | null;
      form_reason?: string | null;
    }[];
    if (!wanted.some((s) => s.requires_form_id) && personal.length === 0) return null;

    const { data: templateRows } = await db
      .from("form_templates")
      .select("id, name, blocks, active")
      .eq("studio_id", args.studioId)
      .eq("active", true);
    const templates = new Map((templateRows ?? []).map((t) => [t.id as string, t.name as string]));

    const { data: theirs } = await db
      .from("client_forms")
      .select("id, contact_id, template_id, status, signed_at, created_at, token, expires_at")
      .eq("studio_id", args.studioId)
      .eq("contact_id", args.contactId);

    const need = formNeeded(
      {
        serviceId: args.serviceId,
        title: args.title,
        contactId: args.contactId,
        artistId: args.artistId ?? null,
      },
      wanted,
      templates,
      (theirs ?? []) as { id: string; contact_id: string; template_id: string | null; status: string; signed_at: string | null; created_at: string }[],
      new Date(),
      personal as { service_id: string; artist_id: string; requires_form_id?: string | null; form_reason?: string | null }[],
    );
    if (!need || need.state === "signed") return null;

    if (need.state === "waiting") {
      /*
       * The link they already have, as long as it has a week left on it.
       *
       * A form sent forty days ago is still "waiting", and sending its link
       * again hands the customer a page that says the link has run out — at
       * the exact moment they have just booked and are willing to fill it in.
       * A fresh one is made below instead.
       */
      const existing = (theirs ?? []).find((f) => f.id === need.formId) as
        | { token?: string | null; expires_at?: string | null }
        | undefined;
      const lastsLongEnough =
        !existing?.expires_at || Date.parse(existing.expires_at) > Date.now() + 7 * 86_400_000;
      if (existing?.token && lastsLongEnough) {
        return { name: need.name, url: `${args.origin}/f/${existing.token}` };
      }
    }

    const template = (templateRows ?? []).find((t) => t.id === need.templateId);
    if (!template) return null;

    const token = randomBytes(24).toString("base64url");
    const { error } = await db.from("client_forms").insert({
      studio_id: args.studioId,
      contact_id: args.contactId,
      template_id: template.id,
      booking_id: args.bookingId,
      title: template.name,
      blocks: template.blocks,
      status: "sent",
      token,
      expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      sent_via: "assistant",
      sent_at: new Date().toISOString(),
    });
    if (error) return null;

    return { name: template.name as string, url: `${args.origin}/f/${token}` };
  } catch {
    return null;
  }
}
