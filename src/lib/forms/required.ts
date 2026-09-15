/**
 * Whether an appointment still needs a form signed before it happens.
 *
 * A service can name a form it needs first — a patch test before colour, a
 * consent before a tattoo, a health questionnaire before a first session. The
 * appointment is for a service either through the enquiry the assistant took
 * or, for one typed into the diary, by its title matching a service by name.
 *
 * Signed counts for a year. Most consents are renewed annually, and asking a
 * regular to sign the same patch-test form every three weeks is how a form
 * stops being read.
 */

export const SIGNED_FOR_DAYS = 365;

export type FormNeed = {
  templateId: string;
  name: string;
  state: "signed" | "waiting" | "missing";
  /** The form already sent and not signed, to open or chase. */
  formId?: string;
};

export function formNeeded(
  appointment: { serviceId: string | null; title: string | null; contactId: string | null },
  services: { id: string; name: string; requires_form_id?: string | null }[],
  templates: Map<string, string>,
  contactForms: { id: string; contact_id: string; template_id: string | null; status: string; signed_at: string | null; created_at: string }[],
  now: Date = new Date(),
): FormNeed | null {
  const service =
    services.find((s) => s.id === appointment.serviceId) ??
    services.find((s) => appointment.title && s.name.trim().toLowerCase() === appointment.title.trim().toLowerCase());
  const templateId = service?.requires_form_id;
  if (!templateId || !templates.has(templateId)) return null;

  const name = templates.get(templateId)!;
  const theirs = contactForms
    .filter((f) => f.contact_id === appointment.contactId && f.template_id === templateId && f.status !== "void")
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  const signed = theirs.find(
    (f) => (f.status === "signed" || f.status === "paper") && f.signed_at && now.getTime() - Date.parse(f.signed_at) < SIGNED_FOR_DAYS * 86_400_000,
  );
  if (signed) return { templateId, name, state: "signed", formId: signed.id };

  const waiting = theirs.find((f) => f.status === "sent" || f.status === "opened");
  if (waiting) return { templateId, name, state: "waiting", formId: waiting.id };

  return { templateId, name, state: "missing" };
}
