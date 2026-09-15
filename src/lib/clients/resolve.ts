import type { SupabaseClient } from "@supabase/supabase-js";
import { hasColumn } from "@/lib/db/hasColumn";

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
  fields: {
    id?: string | null;
    name?: string | null;
    phone?: string | null;
    email?: string | null;
    /** Which way they would rather be reached, where they said. */
    prefers?: string | null;
  },
): Promise<string | null> {
  /*
   * An id is only taken if it is one of this business's clients.
   *
   * It comes from a form, and bookings and payments written with it are read
   * later by the reminder sweep and the receipt — both on the server's own
   * client. A doctored id from another business would have had that business's
   * customer reminded, and receipted, in this one's name.
   */
  const id = (fields.id ?? "").trim();
  if (id) {
    const { data: ours } = await db
      .from("contacts")
      .select("id")
      .eq("id", id)
      .eq("studio_id", studioId)
      .maybeSingle();
    return (ours as { id?: string } | null)?.id ?? null;
  }

  const name = (fields.name ?? "").trim();
  // No name is a real answer, not a failure: a passer-by who bought a bottle
  // and did not give one is still a sale, and inventing a client record for
  // them would fill the book with people nobody can greet.
  if (!name) return null;

  /*
   * Whatever was offered, and nothing invented.
   *
   * An empty box is left off the row rather than written as a blank string: a
   * contact with `phone: ""` looks like somebody who has a number to every
   * query that asks whether they can be texted, and then the text fails.
   */
  const phone = (fields.phone ?? "").trim();
  const email = (fields.email ?? "").trim().toLowerCase();

  /*
   * A preference only where they gave one, and only one we understand.
   *
   * Written through a guard because the column arrives with a migration, and
   * PostgREST refuses an entire insert over one column it has not heard of —
   * so without this a deploy landing first would stop anybody adding a client
   * at all, which is a far worse morning than one without preferences.
   */
  const wanted = (fields.prefers ?? "").trim();
  const prefers = wanted === "sms" || wanted === "email" ? wanted : null;
  const canPrefer = prefers ? await hasColumn(db, "contacts", "prefers") : false;

  const { data } = await db
    .from("contacts")
    .insert({
      studio_id: studioId,
      name,
      ...(phone ? { phone } : {}),
      ...(email ? { email } : {}),
      ...(canPrefer ? { prefers } : {}),
    })
    .select("id")
    .single();

  return (data as { id?: string } | null)?.id ?? null;
}
