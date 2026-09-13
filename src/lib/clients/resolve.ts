import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * What the client picker submitted, turned into a client.
 *
 * An existing client comes back from the search with an id. A name typed in
 * fresh comes back without one, and gets a record made for them there and
 * then — so a booking taken over the phone, a walk-in and a bottle sold at the
 * desk all build the same history the assistant builds, instead of three
 * different half-histories.
 *
 * Shared rather than written out per form, which is how the counter sale would
 * otherwise have ended up being the one place a new name did not become a
 * client. That is the difference between "she's been in twice" and "we have no
 * idea who she is" the next time she rings.
 */
export async function resolveContact(
  db: Pick<SupabaseClient, "from">,
  studioId: string,
  fields: { id?: string | null; name?: string | null; phone?: string | null },
): Promise<string | null> {
  const id = (fields.id ?? "").trim();
  if (id) return id;

  const name = (fields.name ?? "").trim();
  // No name is a real answer, not a failure: a passer-by who bought a bottle
  // and did not give one is still a sale, and inventing a client record for
  // them would fill the book with people nobody can greet.
  if (!name) return null;

  const phone = (fields.phone ?? "").trim();

  const { data } = await db
    .from("contacts")
    .insert({ studio_id: studioId, name, ...(phone ? { phone } : {}) })
    .select("id")
    .single();

  return (data as { id?: string } | null)?.id ?? null;
}
