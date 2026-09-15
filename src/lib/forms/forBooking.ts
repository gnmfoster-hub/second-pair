import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formNeeded } from "./required";

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
  args: { studioId: string; contactId: string; bookingId: string; serviceId: string | null; title: string | null; origin: string },
): Promise<{ name: string; url: string } | null> {
  try {
    const { data: services } = await db
      .from("services")
      .select("id, name, requires_form_id")
      .eq("studio_id", args.studioId)
      .not("requires_form_id", "is", null);
    if (!services?.length) return null;

    const { data: templateRows } = await db
      .from("form_templates")
      .select("id, name, blocks, active")
      .eq("studio_id", args.studioId)
      .eq("active", true);
    const templates = new Map((templateRows ?? []).map((t) => [t.id as string, t.name as string]));

    const { data: theirs } = await db
      .from("client_forms")
      .select("id, contact_id, template_id, status, signed_at, created_at, token")
      .eq("studio_id", args.studioId)
      .eq("contact_id", args.contactId);

    const need = formNeeded(
      { serviceId: args.serviceId, title: args.title, contactId: args.contactId },
      services as { id: string; name: string; requires_form_id: string | null }[],
      templates,
      (theirs ?? []) as { id: string; contact_id: string; template_id: string | null; status: string; signed_at: string | null; created_at: string }[],
    );
    if (!need || need.state === "signed") return null;

    if (need.state === "waiting") {
      const existing = (theirs ?? []).find((f) => f.id === need.formId);
      if (existing?.token) return { name: need.name, url: `${args.origin}/f/${existing.token}` };
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
