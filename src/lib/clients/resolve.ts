import type { SupabaseClient } from "@supabase/supabase-js";
/* Relative and with the extension, so node can run the tests beside this. */
import { hasColumn } from "../db/hasColumn.ts";

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
      .select("id, phone, email")
      .eq("id", id)
      .eq("studio_id", studioId)
      .maybeSingle();

    const them = ours as { id?: string; phone?: string | null; email?: string | null } | null;
    if (!them?.id) return null;

    /*
     * A detail put right while they are still on the phone.
     *
     * Giles: "if when adding something to the diary that is already a client it
     * should check the contact details of the customer at that stage so they can
     * be changed if required". The picker sends one of these only when somebody
     * has pressed Change and typed over what was there, so anything arriving
     * here is a correction somebody meant to make.
     *
     * Blank is never written. An empty box is far more likely to be a slip than
     * a decision to take somebody's only phone number off them, and a contact
     * with `phone: ""` reads as somebody with a number to every query that asks
     * whether they can be texted. Taking a detail off is done on their own page,
     * where the screen is about them rather than about a booking.
     */
    const newPhone = (fields.phone ?? "").trim();
    const newEmail = (fields.email ?? "").trim().toLowerCase();

    const put: Record<string, string> = {};
    if (newPhone && newPhone !== (them.phone ?? "")) put.phone = newPhone;
    if (newEmail && newEmail !== (them.email ?? "").toLowerCase()) put.email = newEmail;

    if (Object.keys(put).length) {
      /*
       * Scoped to the business as well as the id. The id was already checked
       * above; saying it again on the write costs nothing and means no later
       * caller can turn this into a way to edit another business's customer.
       */
      await db.from("contacts").update(put).eq("id", them.id).eq("studio_id", studioId);
    }

    return them.id;
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
