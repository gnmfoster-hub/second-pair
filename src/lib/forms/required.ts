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
  /**
   * Why it is being asked for, in the business's or the person's own words.
   *
   * Given to the assistant so it can say something better than "a form is
   * required before I can book that" — which is true, and tells a customer
   * standing in their kitchen absolutely nothing.
   */
  reason?: string | null;
};

/** What one person requires for one service, over and above the business. */
export type PersonRequires = {
  service_id: string;
  artist_id: string;
  requires_form_id?: string | null;
  form_reason?: string | null;
};

export function formNeeded(
  appointment: {
    serviceId: string | null;
    title: string | null;
    contactId: string | null;
    /** Whose appointment it is. Null for a business with one diary. */
    artistId?: string | null;
  },
  services: { id: string; name: string; requires_form_id?: string | null; form_reason?: string | null }[],
  templates: Map<string, string>,
  contactForms: { id: string; contact_id: string; template_id: string | null; status: string; signed_at: string | null; created_at: string }[],
  now: Date = new Date(),
  /**
   * What the person doing the work asks for on top.
   *
   * One stylist wants a patch test before every colour; the one at the next
   * chair has been doing it twenty years and asks at the consultation. The
   * business-wide setting could not express that, so a team had to agree on
   * one answer for everybody.
   *
   * Adds only. If the business requires a form, nobody on the team can quietly
   * decide otherwise — that is a safety decision and it belongs to whoever
   * runs the place.
   */
  personRequires: PersonRequires[] = [],
): FormNeed | null {
  const service =
    services.find((s) => s.id === appointment.serviceId) ??
    services.find((s) => appointment.title && s.name.trim().toLowerCase() === appointment.title.trim().toLowerCase());

  const personal =
    service && appointment.artistId
      ? personRequires.find(
          (p) => p.service_id === service.id && p.artist_id === appointment.artistId,
        )
      : undefined;

  /*
   * The business first, then the person.
   *
   * The business's form is the one that cannot be argued with, so it wins when
   * both are set: a patch test the salon requires is not replaced by a
   * consultation note one stylist prefers. The person's only applies where the
   * business asks for nothing.
   */
  const templateId = service?.requires_form_id ?? personal?.requires_form_id ?? null;
  const why = service?.requires_form_id ? service.form_reason : personal?.form_reason;
  if (!templateId || !templates.has(templateId)) return null;

  const name = templates.get(templateId)!;
  const theirs = contactForms
    .filter((f) => f.contact_id === appointment.contactId && f.template_id === templateId && f.status !== "void")
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  const signed = theirs.find(
    (f) => (f.status === "signed" || f.status === "paper") && f.signed_at && now.getTime() - Date.parse(f.signed_at) < SIGNED_FOR_DAYS * 86_400_000,
  );
  if (signed) return { templateId, name, state: "signed", formId: signed.id, reason: why ?? null };

  const waiting = theirs.find((f) => f.status === "sent" || f.status === "opened");
  if (waiting) return { templateId, name, state: "waiting", formId: waiting.id, reason: why ?? null };

  return { templateId, name, state: "missing", reason: why ?? null };
}
